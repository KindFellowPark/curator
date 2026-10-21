import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Persist a reorder.
 *
 * Rank is couch state and never reaches the spreadsheet, so this writes straight to
 * the read model and stages nothing — a `pending_actions` row would be an instruction to
 * the workbook that the workbook has no column for.
 *
 * The write is two statements, not one, because `watchlist_rank_idx` is a plain unique
 * index: a single UPDATE that walks rows one at a time can transiently give two rows the
 * same rank and trip it, even though the final state is valid. Clearing to NULL first
 * sidesteps that — the index is partial (`WHERE rank IS NOT NULL`), so a set of nulls
 * never collides. Both statements ride one transaction, so a failure cannot leave the
 * queue unranked.
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

  const { order } = (body ?? {}) as { order?: unknown };
  if (!Array.isArray(order) || order.some((t) => typeof t !== 'string')) {
    return NextResponse.json({ error: 'order must be an array of titles' }, { status: 400 });
  }
  const titles = order as string[];
  if (new Set(titles).size !== titles.length) {
    return NextResponse.json({ error: 'order contains duplicate titles' }, { status: 400 });
  }

  const ranks = titles.map((_, i) => i + 1);
  const q = sql();

  await q.transaction([
    q`UPDATE watchlist SET rank = NULL WHERE rank IS NOT NULL`,
    q`UPDATE watchlist AS w
      SET rank = v.rank
      FROM (SELECT * FROM unnest(${titles}::text[], ${ranks}::int[]) AS t(title, rank)) AS v
      WHERE w.title = v.title`,
  ]);

  return NextResponse.json({ ranked: titles.length });
}
