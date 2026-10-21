import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { sql, similarRows } from '@/lib/db';
import { similarTitles } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

/**
 * If-you-liked-this, for one anchor title.
 *
 * Curation is eager for T1 anchors and on-demand otherwise (design, Recommendation
 * architecture), so an anchor with nothing curated is an expected state, not a failure.
 * When that happens two things occur, exactly as the design specifies: raw TMDB similars
 * are shown *marked as such*, and a curation request is staged for the offline process to fulfil.
 *
 * WHY RAW TMDB IS ALLOWED HERE when no inference runs in this app. It is not inference —
 * it is a catalogue call, TMDB's own similarity list in TMDB's own order, re-ranked by
 * nothing and with vote_average never read. What would be out of bounds is presenting it
 * as curated, which is why `curated: false` rides on every row and the UI is required to
 * say so. A raw list silently occupying a slot the user reads as "chosen for you" is the
 * failure this guards against, not the fetch.
 *
 * A raw row carries no database id and no prediction, so its id is namespaced `tmdb:<id>`
 * and a verdict on it posts with source 'raw'. Null prediction is honest: there is no
 * prediction, and inventing one would corrupt the calibration measure.
 */
export async function GET(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const anchor = (url.searchParams.get('anchor') ?? '').trim();
  const tmdbId = Number(url.searchParams.get('tmdb_id') ?? '');
  const type = url.searchParams.get('type') === 'TV' ? 'TV' : 'Movie';
  if (!anchor) return NextResponse.json({ error: 'anchor is required' }, { status: 400 });

  const curated = await similarRows(anchor);
  if (curated.length > 0) {
    return NextResponse.json({ rows: curated, curated: true, requested: false });
  }

  // Nothing curated. Stage the request once, then fall back to the catalogue.
  const q = sql();
  const [existing] = await q`
    SELECT id FROM pending_actions
    WHERE kind = 'curation_request' AND consumed_at IS NULL AND title = ${anchor}
    LIMIT 1
  `;
  if (!existing) {
    const payload = JSON.stringify({
      anchor_title: anchor,
      tmdb_id: Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null,
      type,
      note: 'similars opened from the rec detail sheet with nothing curated',
    });
    await q`INSERT INTO pending_actions (kind, title, payload, actor)
            VALUES ('curation_request', ${anchor}, ${payload}::jsonb, ${actor})`;
  }

  const raw =
    Number.isInteger(tmdbId) && tmdbId > 0 ? await similarTitles(tmdbId, type) : [];

  return NextResponse.json({
    rows: raw.map((h, i) => ({
      id: `tmdb:${h.tmdb_id}`,
      anchor_title: anchor,
      title: h.title,
      type: h.type,
      curated: false,
      badges: null,
      position: i,
      tmdb_id: h.tmdb_id,
      poster_path: h.poster_path,
      year: h.year,
      synopsis: null,
    })),
    curated: false,
    requested: !existing,
  });
}
