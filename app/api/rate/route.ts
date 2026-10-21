import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The rate sheet's write path. Two things happen, in one transaction:
 *
 *  1. A row is staged in pending_actions. This is the only durable consequence —
 *     the sync script replays it through the spreadsheet's writer, its sole writer.
 *  2. The disposable read model is moved optimistically, so the couch sees the rating
 *     immediately instead of waiting for a sync that happens at a desk. The disposable
 *     store makes this safe: everything here except unconsumed pending rows is regenerated from the
 *     workbook, so an optimistic row that the replay later contradicts is simply replaced.
 *
 * Tier is derived by `tier_from_stars()` in the UPDATE itself. The app never computes it,
 * which is why the value can never disagree with the shelf_tier_matches_stars constraint.
 */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  const { title, type, stars, rewatchable, notes, reasons, origin, extent, tmdb_id } = (body ?? {}) as {
    title?: string;
    type?: string;
    stars?: string | null;
    rewatchable?: boolean | null;
    notes?: string | null;
    reasons?: unknown;
    origin?: string;
    extent?: string | null;
    tmdb_id?: number | null;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (type !== 'TV' && type !== 'Movie') {
    return NextResponse.json({ error: "type must be 'TV' or 'Movie'" }, { status: 400 });
  }
  // Half steps in [0.5, 5.0]. Validated here as well as by the star_rating domain so a
  // bad client gets a 400 rather than a 500 out of the database.
  const n = Number(stars);
  if (stars === null || stars === undefined || !Number.isFinite(n) || n < 0.5 || n > 5 || (n * 2) % 1 !== 0) {
    return NextResponse.json({ error: 'stars must be a half step between 0.5 and 5.0' }, { status: 400 });
  }
  if (rewatchable !== null && rewatchable !== undefined && typeof rewatchable !== 'boolean') {
    return NextResponse.json({ error: 'rewatchable must be boolean or null' }, { status: 400 });
  }
  // A TMDB id is a positive integer or nothing. Anything else is a client bug, and a
  // bad id would silently join to the wrong artwork rather than to none.
  if (
    tmdb_id !== null && tmdb_id !== undefined &&
    (typeof tmdb_id !== 'number' || !Number.isInteger(tmdb_id) || tmdb_id <= 0)
  ) {
    return NextResponse.json({ error: 'tmdb_id must be a positive integer or null' }, { status: 400 });
  }

  const clean = title.trim();
  const rw = rewatchable ?? null;
  const nt = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
  const rs = Array.isArray(reasons) ? reasons.filter((r) => typeof r === 'string').slice(0, 8) : [];
  // Empty string is meaningful: it is how "I have now finished it" is expressed, and it
  // must reach the spreadsheet writer as a clear rather than as an absent field.
  const ex = typeof extent === 'string' ? (extent.trim() || null) : null;
  // Forwarded, never resolved here. The id rides along so a queued title keeps the
  // match the offline TMDB matcher already paid for instead of reverting to a placeholder
  // on the shelf until the matcher's next run.
  const tid = typeof tmdb_id === 'number' ? tmdb_id : null;

  const q = sql();

  const [existing] = await q`SELECT title FROM shelf WHERE title = ${clean}`;
  const kind = existing ? 'rerate' : 'log';

  const payload = JSON.stringify({
    type,
    stars: String(stars),
    rewatchable: rw,
    notes: nt,
    reasons: rs,
    extent: ex,
    origin: origin ?? null,
  });

  await q.transaction([
    q`INSERT INTO pending_actions (kind, title, payload, actor)
      VALUES (${kind}, ${clean}, ${payload}::jsonb, ${actor})`,

    // Optimistic snapshot move. tier and tier_label both come from the database's own
    // mapping — the app supplies stars and nothing else.
    q`INSERT INTO shelf (title, type, stars, tier, tier_label, rewatchable, notes, extent, tmdb_id)
      VALUES (${clean}, ${type}, ${String(stars)}::star_rating,
              tier_from_stars(${String(stars)}::numeric),
              tier_label(tier_from_stars(${String(stars)}::numeric)),
              ${rw}, ${nt}, ${ex}, ${tid})
      ON CONFLICT (title) DO UPDATE SET
        stars       = EXCLUDED.stars,
        tier        = EXCLUDED.tier,
        tier_label  = EXCLUDED.tier_label,
        -- A rate sheet opened from the shelf carries the existing values in, so an
        -- explicit null here is a cleared field and not an absent one.
        rewatchable = EXCLUDED.rewatchable,
        notes       = EXCLUDED.notes,
        extent      = EXCLUDED.extent,
        -- COALESCE, not EXCLUDED: unlike the fields above, an absent id is absent and
        -- never a clear. A client that omits it must not erase a resolution on a
        -- re-rate, and there is no gesture in the UI that means "forget the match".
        tmdb_id     = COALESCE(EXCLUDED.tmdb_id, shelf.tmdb_id)`,

    // Watched, so it leaves the queue. The spreadsheet writer owns the same handoff
    // on the workbook side; this is only the couch's view of it moving.
    q`DELETE FROM watchlist WHERE title = ${clean}`,
  ]);

  return NextResponse.json({ staged: kind }, { status: 201 });
}
