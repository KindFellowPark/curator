import { neon } from '@neondatabase/serverless';

/**
 * Neon over HTTP. One round trip per query, no pool to keep warm, which suits a
 * serverless function far better than a TCP pool that outlives no invocation.
 *
 * DATABASE_URL is read at call time rather than at module load: the Neon password
 * rotates, so a URI captured once at cold start would eventually be a stale credential
 * held by a warm instance.
 */
export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

/** A shelf row as the read model stores it. Tier is derived upstream, never here. */
export type ShelfRow = {
  title: string;
  type: 'TV' | 'Movie';
  stars: string | null; // numeric(2,1) arrives as a string; never coerce to float for display
  tier: number;
  tier_label: string;
  rewatchable: boolean | null; // NULL = unrecorded. Never render a NULL as "no".
  notes: string | null;
  // How much of it has been seen. NULL = all of it; 'S1E1' means the rating covers that
  // much and no more, which is what makes a provisional rating readable as provisional.
  extent: string | null;
  tmdb_id: number | null;
  // Joined from title_meta, which is a pure cache — a null here means "not matched yet
  // or no art on file", never "this title is broken". Poster falls back on its own.
  poster_path: string | null;
};

export type WatchlistRow = {
  title: string;
  type: 'TV' | 'Movie';
  source: string | null;
  added: string | null;
  notes: string | null;
  rank: number | null;
  tmdb_id: number | null;
  poster_path: string | null;
};

export type SlateRow = {
  id: string;
  title: string;
  type: 'TV' | 'Movie';
  /** One-line case, shown on the card itself. Case layer. */
  why: string | null;
  /** Longer case incl. its honest caveat, shown in the detail sheet. Case layer. */
  rationale: string | null;
  /** Verified claims authored outside the app. Facts layer — never an argument. */
  badges: string[] | null;
  position: number;
  tmdb_id: number | null;
  poster_path: string | null;
  // Catalogue facts, joined from title_meta. The facts layer renders these beside the
  // badges; runtime, seasons, director and cast are NOT available — title_meta.raw is
  // candidate_row() output and drops them. Widening that cache is a change to the offline matcher.
  year: number | null;
  synopsis: string | null;
};

/** A similar title under one anchor. Same card component as a slate row renders it. */
export type SimilarRow = {
  id: string;
  anchor_title: string;
  title: string;
  type: 'TV' | 'Movie';
  /** false = raw TMDB, and the UI must say so rather than implying it was curated. */
  curated: boolean;
  badges: string[] | null;
  position: number;
  tmdb_id: number | null;
  poster_path: string | null;
  year: number | null;
  synopsis: string | null;
};

export type QuestionRow = {
  id: string;
  question: string;
  provenance: string | null;
  rank: number;
};

/**
 * The read-model queries, defined once.
 *
 * Each of these ran in two places — the page, for the server-rendered first paint, and
 * the API route, for everything after. Keeping them in sync was left to whoever
 * remembered, and at one point nobody did: the routes learned to join title_meta for
 * poster art and the pages did not, so every first paint rendered placeholder blocks
 * and the artwork only appeared if something happened to refetch.
 *
 * The type cast is why that shipped. `as ShelfRow[]` asserts a shape rather than
 * checking one, so a SELECT missing a column type-checks perfectly and fails at the
 * pixel. One definition per read model removes the class, which a second careful edit
 * would not have.
 */
export async function shelfRows(): Promise<ShelfRow[]> {
  const q = sql();
  return (await q`
    SELECT s.title, s.type, s.stars, s.tier, s.tier_label, s.rewatchable, s.notes,
           s.extent, s.tmdb_id, m.poster_path
    FROM shelf s
    LEFT JOIN title_meta m ON m.tmdb_id = s.tmdb_id
    ORDER BY s.tier ASC, s.title ASC
  `) as ShelfRow[];
}

export async function watchlistRows(): Promise<WatchlistRow[]> {
  const q = sql();
  return (await q`
    SELECT w.title, w.type, w.source, w.added, w.notes, w.rank, w.tmdb_id, m.poster_path
    FROM watchlist w
    LEFT JOIN title_meta m ON m.tmdb_id = w.tmdb_id
    ORDER BY w.rank ASC NULLS LAST, w.title ASC
  `) as WatchlistRow[];
}

/** How many recommendations are on screen at once. Design: ~25 deep, ~5 shown. */
export const SHOWN_DEPTH = 5;
/** Below this many still buffered, the tab says so rather than failing quietly later. */
export const LOW_BUFFER = 5;

/**
 * The visible slate. Only `shown` rows — the buffer behind them is depth, not backlog,
 * and rendering all ~25 would turn a considered five into an infinite scroll.
 *
 * `predicted_stars` is deliberately not selected. It is calibration data that pairs
 * against the actual rating at sync, and showing it would turn a recommendation into a
 * number to argue with.
 */
export async function slateRows(): Promise<SlateRow[]> {
  const q = sql();
  return (await q`
    SELECT s.id::text, s.title, s.type, s.why, s.rationale, s.badges, s.position,
           s.tmdb_id, m.poster_path, m.year, m.synopsis
    FROM slate s
    LEFT JOIN title_meta m ON m.tmdb_id = s.tmdb_id
    WHERE s.state = 'shown'
    ORDER BY s.position ASC
  `) as SlateRow[];
}

/**
 * Promote buffered rows until the shown set is back to full depth.
 *
 * Idempotent and self-healing, which is why it runs on read as well as after a verdict:
 * a slate pushed by sync arrives entirely `buffered` (the column default), so without
 * this the For-you tab would render empty against a full buffer. Called in both places
 * rather than at push time so the app cannot depend on the generator remembering.
 */
export async function promoteSlate(depth = SHOWN_DEPTH): Promise<void> {
  const q = sql();
  await q`
    UPDATE slate SET state = 'shown'
    WHERE id IN (
      SELECT id FROM slate WHERE state = 'buffered' ORDER BY position ASC
      LIMIT GREATEST(0, ${depth}::integer - (SELECT count(*) FROM slate WHERE state = 'shown'))
    )
  `;
}

/** What is left behind the shown set — drives the "slate running low" state. */
export async function bufferedCount(): Promise<number> {
  const q = sql();
  const [row] = (await q`
    SELECT count(*)::int AS n FROM slate WHERE state = 'buffered'
  `) as { n: number }[];
  return row?.n ?? 0;
}

/**
 * Similars for one anchor title. Curated rows first: an uncurated row is raw TMDB shown
 * marked as such, and ordering it above a curated one would misrepresent both.
 */
export async function similarRows(anchor: string): Promise<SimilarRow[]> {
  const q = sql();
  return (await q`
    SELECT s.id::text, s.anchor_title, s.title, s.type, s.curated, s.badges, s.position,
           s.tmdb_id, m.poster_path, m.year, m.synopsis
    FROM similars s
    LEFT JOIN title_meta m ON m.tmdb_id = s.tmdb_id
    WHERE s.anchor_title = ${anchor}
    ORDER BY s.curated DESC, s.position ASC
  `) as SimilarRow[];
}

/**
 * The single question on offer, or null. One at a time by design — a queue rendered as a
 * queue becomes a chore, and the ranking is by information value, so the top one is the
 * only one worth asking. Skipped rows are excluded permanently: a skip is an answer
 * about the question, and re-asking would spend the one thing this surface has.
 */
export async function nextQuestion(): Promise<QuestionRow | null> {
  const q = sql();
  const [row] = (await q`
    SELECT id::text, question, provenance, rank
    FROM question_queue
    WHERE answered_at IS NULL AND skipped = false
    ORDER BY rank ASC
    LIMIT 1
  `) as QuestionRow[];
  return row ?? null;
}
