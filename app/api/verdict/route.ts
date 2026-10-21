import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { sql, promoteSlate } from '@/lib/db';
import { REASONS } from '@/lib/reasons';

export const dynamic = 'force-dynamic';

/** The three verdicts every rec card offers. Same set for slate and similar cards. */
const VERDICTS = ['queue', 'not_interested', 'seen_it'] as const;
type Verdict = (typeof VERDICTS)[number];

/**
 * A verdict on a recommendation. Always stages evidence; sometimes moves the read model.
 *
 * WHY THE SERVER READS predicted_stars RATHER THAN THE CLIENT SENDING IT. Every slate and
 * similar row carries a hidden predicted-stars value, and the point of it is that a
 * verdict lands paired with its prediction so rec calibration becomes a measured number.
 * The value is deliberately absent from the read models (it would turn a recommendation
 * into a number to argue with), so the client cannot send what it was never given — and
 * should not be trusted with it if it could. The pairing is done here, from the row.
 *
 * WHAT EACH VERDICT DOES BEYOND STAGING:
 *   queue           → the watchlist gains the title, source recorded as the rec surface.
 *   not_interested  → nothing moves. The reasons are the whole payload.
 *   seen_it         → nothing moves here. The client opens the rate sheet, which stages
 *                     its own `log` through /api/rate. Two staged rows, deliberately:
 *                     the verdict is evidence that the rec found an unlogged title near
 *                     the household's taste, and the rating is evidence about the title. Collapsing
 *                     them would lose the first, which is the sheet-gap signal.
 *
 * The source row is marked resolved and the buffer promoted, so the card leaves the slate
 * on the same round trip that recorded the verdict.
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

  const { id, source, verdict, reasons, title, type } = (body ?? {}) as {
    id?: string;
    source?: string;
    verdict?: string;
    reasons?: unknown;
    title?: string;
    type?: string;
  };

  if (source !== 'slate' && source !== 'similar' && source !== 'raw') {
    return NextResponse.json(
      { error: "source must be 'slate', 'similar' or 'raw'" },
      { status: 400 },
    );
  }
  if (!VERDICTS.includes(verdict as Verdict)) {
    return NextResponse.json(
      { error: `verdict must be one of ${VERDICTS.join(', ')}` },
      { status: 400 },
    );
  }
  // Ids are bigint identity values arriving as strings, because JSON numbers cannot hold
  // a bigint safely. Validate the shape rather than coercing. A raw catalogue row has no
  // database id at all, so it identifies itself by title and type instead.
  if (source !== 'raw' && (typeof id !== 'string' || !/^\d+$/.test(id))) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  if (source === 'raw') {
    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required for a raw verdict' }, { status: 400 });
    }
    if (type !== 'TV' && type !== 'Movie') {
      return NextResponse.json({ error: "type must be 'TV' or 'Movie'" }, { status: 400 });
    }
  }

  // Only the known vocabulary. An unrecognised chip is dropped rather than 400'd: the
  // reasons are optional enrichment and must never be the reason a verdict fails to land.
  const rs = Array.isArray(reasons)
    ? reasons.filter((r): r is string => typeof r === 'string' && REASONS.includes(r as never)).slice(0, 8)
    : [];

  const q = sql();

  // Read the row for its title, type and — the point of this lookup — its prediction.
  // A raw catalogue row has none of these on file: it is not a recommendation this system
  // made, so it carries no prediction and none is invented.
  type Src = { title: string; type: 'TV' | 'Movie'; predicted_stars: string | null; anchor_title: string | null };
  let row: Src | undefined;
  if (source === 'raw') {
    row = { title: title!.trim(), type: type as 'TV' | 'Movie', predicted_stars: null, anchor_title: null };
  } else {
    [row] = (await (source === 'slate'
      ? q`SELECT title, type, predicted_stars::text AS predicted_stars, NULL::text AS anchor_title
          FROM slate WHERE id = ${id}::bigint`
      : q`SELECT title, type, predicted_stars::text AS predicted_stars, anchor_title
          FROM similars WHERE id = ${id}::bigint`)) as Src[];
  }

  if (!row) return NextResponse.json({ error: 'no such recommendation' }, { status: 404 });

  const payload = JSON.stringify({
    verdict,
    type: row.type,
    reasons: rs,
    source,
    source_id: source === 'raw' ? null : id,
    anchor_title: row.anchor_title,
    // The other half of the calibration pair. Null is honest — a hand-authored slate row
    // without a prediction simply has none, and inventing one would poison the measure
    // this column exists to produce.
    predicted_stars: row.predicted_stars,
  });

  const writes = [
    q`INSERT INTO pending_actions (kind, title, payload, actor)
      VALUES ('verdict', ${row.title}, ${payload}::jsonb, ${actor})`,
  ];

  if (verdict === 'queue') {
    // Optimistic, like /api/rate: the couch sees it queued now, and sync reconciles.
    // ON CONFLICT DO NOTHING because queueing something already queued is a no-op, not
    // an error worth interrupting a verdict for.
    writes.push(
      q`INSERT INTO pending_actions (kind, title, payload, actor)
        VALUES ('want', ${row.title},
                ${JSON.stringify({ type: row.type, source: `rec:${source}`, notes: null })}::jsonb,
                ${actor})`,
      q`INSERT INTO watchlist (title, type, source, added, rank)
        VALUES (${row.title}, ${row.type}, ${`rec:${source}`}, CURRENT_DATE,
                (SELECT coalesce(max(rank), 0) + 1 FROM watchlist))
        ON CONFLICT (title) DO NOTHING`,
    );
  }

  // A resolved slate row leaves the shown set. Similars have no state column — they are a
  // cache keyed by anchor, not a buffer, and a verdict on one does not consume it.
  if (source === 'slate') {
    writes.push(q`UPDATE slate SET state = 'resolved' WHERE id = ${id}::bigint`);
  }

  await q.transaction(writes);

  // Outside the transaction on purpose: promotion is a repair, not part of the verdict.
  // If it fails the verdict is still correctly recorded, and the next read promotes.
  if (source === 'slate') await promoteSlate();

  return NextResponse.json({ staged: 'verdict', verdict }, { status: 201 });
}
