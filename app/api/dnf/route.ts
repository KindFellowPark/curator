import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Bailed. Stages a DNF evidence event and touches nothing else.
 *
 * Deliberately not a rating and deliberately not a workbook row: abandoning something
 * halfway is high-signal evidence about taste, but it is not a judgement of the whole
 * title, and forcing it into a star value would put an opinion in the workbook that was
 * never formed. The shelf is not written and the watchlist row is left where it is —
 * what to do with a bailed queue entry is a sync-side decision, not something
 * the couch should silently resolve.
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

  const { title, type, marker, reasons, origin, likedBeforeBail } = (body ?? {}) as {
    title?: string;
    type?: string;
    marker?: string | null;
    reasons?: unknown;
    origin?: string;
    likedBeforeBail?: boolean | null;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (type !== 'TV' && type !== 'Movie') {
    return NextResponse.json({ error: "type must be 'TV' or 'Movie'" }, { status: 400 });
  }
  if (likedBeforeBail !== null && likedBeforeBail !== undefined && typeof likedBeforeBail !== 'boolean') {
    return NextResponse.json({ error: 'likedBeforeBail must be boolean or null' }, { status: 400 });
  }

  const q = sql();

  /**
   * `liked_before_bail` is TV-only and is the difference between two DNFs that mean
   * opposite things. A show abandoned in S3 having been loved through S1-S2 is not
   * evidence that the household dislikes it — it is strong evidence about what S1-S2 is, plus
   * a narrow negative at the bail point. A show that never hooked is negative all the
   * way down. Both are excluded from recommendations identically; only one of them is
   * usable as positive taste evidence, and nothing downstream can tell them apart
   * without this field.
   *
   * It is an explicit field rather than something synthesis infers from the reason
   * chips, because a field is checkable and an inference over free vocabulary is not.
   *
   * Null for a movie, always: not finishing a film means it did not hold him, and there
   * is no episode-by-episode structure for it to have turned partway through. Null is
   * also what a skipped question stores — unrecorded, never a recorded "no".
   */
  const liked = type === 'TV' && typeof likedBeforeBail === 'boolean' ? likedBeforeBail : null;

  const payload = JSON.stringify({
    type,
    marker: typeof marker === 'string' && marker.trim() ? marker.trim() : null,
    reasons: Array.isArray(reasons) ? reasons.filter((r) => typeof r === 'string').slice(0, 8) : [],
    liked_before_bail: liked,
    origin: origin ?? null,
  });

  await q`INSERT INTO pending_actions (kind, title, payload, actor)
          VALUES ('dnf', ${title.trim()}, ${payload}::jsonb, ${actor})`;

  return NextResponse.json({ staged: 'dnf' }, { status: 201 });
}
