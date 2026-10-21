import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { sql, watchlistRows } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Snapshot read. `rank` is app-side couch state and never reaches the workbook. */
export async function GET() {
  if (!(await currentActor())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await watchlistRows();
  return NextResponse.json({ rows, count: rows.length });
}

/**
 * Add to the watchlist: stages a `want` and moves the read model optimistically, the
 * same two-part shape as /api/rate.
 *
 * The Add flow offers TMDB autocomplete (/api/search), and a picked hit contributes
 * its catalogue facts as well as its title: the id lands on the watchlist row and the
 * poster seeds title_meta. Free text stays legal on purpose — a title TMDB has not
 * heard of is still a title the household wants — and simply sends nulls.
 *
 * ON OVERTURNING "a hit contributes a title, a type and nothing else". That rule was
 * written when the id had nowhere to go. It has two now, and discarding it cost real
 * things: the client already rendered the picked poster optimistically, so the artwork
 * appeared on add and silently vanished on the next fetch, and the id itself had to be
 * re-derived later by the offline TMDB matcher from a bare title string — a strictly worse resolution
 * than the one the user just made by eye, against the same catalogue, looking at the art.
 *
 * ON THE title_meta SEED. That table is a pure cache, so writing it here breaks no
 * ownership. But the app has only what search returns — no synopsis, no raw record — and
 * `raw` is what the candidate pipeline reads. So the seed leaves `raw` NULL deliberately,
 * and that null is the marker the offline matcher now hydrates on. Without it an app-seeded
 * row would be invisible to backfill forever: unmatched() selects `tmdb_id IS NULL`, and
 * this endpoint is precisely what stops that being null.
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

  const { title, type, source, notes, tmdb_id, year, poster_path } = (body ?? {}) as {
    title?: string;
    type?: string;
    source?: string | null;
    notes?: string | null;
    tmdb_id?: number | null;
    year?: number | null;
    poster_path?: string | null;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (type !== 'TV' && type !== 'Movie') {
    return NextResponse.json({ error: "type must be 'TV' or 'Movie'" }, { status: 400 });
  }

  // A TMDB id is a positive integer or nothing. A bad one would join to the wrong
  // artwork rather than to none, which is worse than a placeholder.
  if (
    tmdb_id !== null && tmdb_id !== undefined &&
    (typeof tmdb_id !== 'number' || !Number.isInteger(tmdb_id) || tmdb_id <= 0)
  ) {
    return NextResponse.json({ error: 'tmdb_id must be a positive integer or null' }, { status: 400 });
  }

  const clean = title.trim();
  const src = typeof source === 'string' && source.trim() ? source.trim() : null;
  const nt = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
  const tid = typeof tmdb_id === 'number' ? tmdb_id : null;
  // Year is cosmetic; an out-of-range value is dropped rather than 400'd, because a
  // weird year must never be the reason a title cannot be queued.
  const yr =
    typeof year === 'number' && Number.isInteger(year) && year > 1870 && year < 2200 ? year : null;
  // TMDB poster paths always begin with a slash and are concatenated onto an image CDN
  // base. Anything else is refused rather than stored: this string becomes a src.
  const art =
    typeof poster_path === 'string' && /^\/[\w./-]+$/.test(poster_path) ? poster_path : null;

  const q = sql();

  // Already watched is a different situation from already queued, and silently adding a
  // duplicate would hide both. The spreadsheet writer enforces the same distinction at replay.
  const [seen] = await q`SELECT title FROM shelf WHERE title = ${clean}`;
  if (seen) {
    return NextResponse.json({ error: 'that is already on the shelf' }, { status: 409 });
  }
  const [queued] = await q`SELECT title FROM watchlist WHERE title = ${clean}`;
  if (queued) {
    return NextResponse.json({ error: 'that is already on the watchlist' }, { status: 409 });
  }

  const payload = JSON.stringify({ type, source: src, notes: nt });

  await q.transaction([
    q`INSERT INTO pending_actions (kind, title, payload, actor)
      VALUES ('want', ${clean}, ${payload}::jsonb, ${actor})`,

    // Seed the poster cache so the artwork survives a reload. Deliberately additive:
    // COALESCE fills only what is missing, and synopsis/raw/fetched_at are never touched
    // here, so a fuller record the offline matcher already wrote always wins over this thinner one.
    // A no-op when there is no id, which is the free-text case.
    q`INSERT INTO title_meta (tmdb_id, title, type, year, poster_path)
      SELECT ${tid}::integer, ${clean}::text, ${type}::title_type, ${yr}::integer, ${art}::text
      WHERE ${tid}::integer IS NOT NULL
      ON CONFLICT (tmdb_id) DO UPDATE SET
        year        = COALESCE(title_meta.year, EXCLUDED.year),
        poster_path = COALESCE(title_meta.poster_path, EXCLUDED.poster_path)`,

    // New entries land at the bottom of the queue rather than the top: rank is a
    // deliberate ordering the couch maintains, and an add should not reorder it.
    q`INSERT INTO watchlist (title, type, source, added, notes, rank, tmdb_id)
      VALUES (${clean}, ${type}, ${src}, CURRENT_DATE, ${nt},
              (SELECT coalesce(max(rank), 0) + 1 FROM watchlist), ${tid})`,
  ]);

  return NextResponse.json({ staged: 'want' }, { status: 201 });
}
