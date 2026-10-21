/**
 * TMDB, app side. Two things only: build image URLs, and proxy a search.
 *
 * The app is a staging front-end and holds no authoritative state, so nothing
 * here caches or decides anything. Matching, backfill and the candidate pool all live
 * in an offline TMDB matcher that runs beside the spreadsheet, outside this repo.
 *
 * ON THE KEY. image.tmdb.org is unauthenticated, so poster rendering needs no
 * credential and none is shipped to the browser. Search does need one, which is why
 * searchTitles() is server-only and reached through /api/search rather than called from
 * a component: a key in client code is a key in the page source.
 */

const IMAGE_BASE = 'https://image.tmdb.org/t/p/';

/** Grid tiles. Smallest size that still holds up at 2x on a phone. */
export const POSTER_GRID = 'w342';
/** Detail panel, where one poster is on screen and has room. */
export const POSTER_DETAIL = 'w500';

export function posterUrl(path: string | null | undefined, size = POSTER_GRID): string | null {
  return path ? IMAGE_BASE + size + path : null;
}

export type SearchHit = {
  tmdb_id: number;
  title: string;
  type: 'TV' | 'Movie';
  year: number | null;
  poster_path: string | null;
};

/**
 * Server-only. Throws when the key is absent rather than returning an empty list: an
 * unconfigured deployment and a genuine no-results are different answers, and rendering
 * the first as the second would make a missing env var look like a title that does not
 * exist.
 */
export async function searchTitles(query: string, type: 'TV' | 'Movie'): Promise<SearchHit[]> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY is not set');

  const path = type === 'Movie' ? 'movie' : 'tv';
  const url =
    `https://api.themoviedb.org/3/search/${path}` +
    `?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
  const data = (await res.json()) as { results?: Record<string, unknown>[] };

  return (data.results ?? []).slice(0, 8).map((r) => {
    const date = String((path === 'movie' ? r.release_date : r.first_air_date) ?? '');
    return {
      tmdb_id: Number(r.id),
      title: String((path === 'movie' ? r.title : r.name) ?? ''),
      type,
      year: /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null,
      poster_path: (r.poster_path as string | null) ?? null,
    };
  });
}

/**
 * TMDB's own "similar to this" list. A catalogue call, not a recommendation: the order is
 * TMDB's and is preserved rather than re-ranked, and nothing here reads vote_average.
 * Everything it returns must be presented as uncurated, because it was chosen by a
 * catalogue and not for anyone.
 *
 * Returns an empty list rather than throwing when the key is absent. This is a secondary
 * slot inside a detail sheet, so an unconfigured deployment should quietly show nothing
 * there — unlike /api/search, where the same silence would read as "no such title".
 */
export async function similarTitles(tmdbId: number, type: 'TV' | 'Movie'): Promise<SearchHit[]> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return [];

  const path = type === 'Movie' ? 'movie' : 'tv';
  const url =
    `https://api.themoviedb.org/3/${path}/${tmdbId}/similar` +
    `?api_key=${encodeURIComponent(key)}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Record<string, unknown>[] };

  return (data.results ?? []).slice(0, 6).map((r) => {
    const date = String((path === 'movie' ? r.release_date : r.first_air_date) ?? '');
    return {
      tmdb_id: Number(r.id),
      title: String((path === 'movie' ? r.title : r.name) ?? ''),
      type,
      year: /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null,
      poster_path: (r.poster_path as string | null) ?? null,
    };
  });
}
