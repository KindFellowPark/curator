-- Curator — Postgres schema (written for Neon, PostgreSQL 18)
--
-- The rules this schema serves:
--   1. The household spreadsheet is the single source of truth. NOTHING here is authoritative.
--   2. Stars 0.5-5.0 in half steps are the captured rating; tier is DERIVED.
--   3. This app stages only; a separate writer script is the sole writer to the spreadsheet.
--   4. This database is disposable — everything except unconsumed pending_actions
--      regenerates from the spreadsheet at sync.
--
-- Because the store is disposable, this file is the schema of record and is written to
-- be re-runnable from empty. It is deliberately idempotent (IF NOT EXISTS) so a rebuild
-- after a wipe is a single command.

-- ---------------------------------------------------------------------------
-- Shared domain rules, enforced in the database rather than trusted to app code.
-- ---------------------------------------------------------------------------

-- A star value must be a half step in [0.5, 5.0]. NULL means unrated, which is legal
-- indefinitely: older titles can carry tier only, and stars are never inferred from a
-- tier. Stored as numeric(2,1) so 4.5 is exact, never a float approximation.
CREATE DOMAIN star_rating AS numeric(2,1)
  CHECK (VALUE IS NULL OR (VALUE >= 0.5 AND VALUE <= 5.0 AND (VALUE * 2) = trunc(VALUE * 2)));

CREATE DOMAIN tier_value AS smallint
  CHECK (VALUE IS NULL OR (VALUE BETWEEN 1 AND 5));

CREATE DOMAIN title_type AS text
  CHECK (VALUE IN ('TV', 'Movie'));

-- The stars-to-tier mapping, as code. The app must never derive tier independently: it reads it
-- from here or from the snapshot. Kept IMMUTABLE so it can back a generated column.
CREATE OR REPLACE FUNCTION tier_from_stars(s numeric)
RETURNS smallint
LANGUAGE sql IMMUTABLE
AS $$
  -- 4.5-5.0 -> 1 | 3.5-4.0 -> 2 | 2.5-3.0 -> 3 | 1.5-2.0 -> 4 | 0.5-1.0 -> 5
  SELECT CASE WHEN s IS NULL THEN NULL
              ELSE (6 - ((trunc(s * 2)::int + 1) / 2))::smallint
         END;
$$;

-- ---------------------------------------------------------------------------
-- Read model: a projection of the spreadsheet, replaced wholesale at each sync.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shelf (
  title          text PRIMARY KEY,
  type           title_type  NOT NULL,
  stars          star_rating,
  tier           tier_value  NOT NULL,
  tier_label     text        NOT NULL,
  rewatchable    boolean,              -- NULL = unrecorded. Never read a NULL as "no".
  notes          text,
  -- How much of the title the rating covers. NULL means all of it; a value like 'S1E1'
  -- or 'S1-S2' means the rating covers that much and no more. A T1 at one episode and a
  -- T1 at four seasons are different claims, and before this column the difference lived
  -- as prose inside notes where nothing could act on it.
  extent         text,
  tmdb_id        integer,
  synced_at      timestamptz NOT NULL DEFAULT now(),
  -- Guard against a snapshot that disagrees with the mapping: where stars exist, tier must match.
  CONSTRAINT shelf_tier_matches_stars
    CHECK (stars IS NULL OR tier = tier_from_stars(stars))
);
CREATE INDEX IF NOT EXISTS shelf_tier_idx    ON shelf (tier);
CREATE INDEX IF NOT EXISTS shelf_unrated_idx ON shelf (title) WHERE stars IS NULL;

-- ---------------------------------------------------------------------------
-- Watchlist. rank is app-side couch state and NEVER syncs to the spreadsheet.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlist (
  title      text PRIMARY KEY,
  type       title_type NOT NULL,
  source     text,
  added      date,
  notes      text,
  rank       integer,
  tmdb_id    integer,
  synced_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_rank_idx ON watchlist (rank) WHERE rank IS NOT NULL;

-- ---------------------------------------------------------------------------
-- The staging surface. Everything the couch produces lands here and reaches the
-- spreadsheet only by the sync script replaying it through the spreadsheet's writer.
--
-- consumed_at is the idempotency key: replay must skip rows already consumed, so a
-- re-run after a partial failure cannot double-log.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_actions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind         text        NOT NULL
                 CHECK (kind IN ('log','want','rerate','verdict','dnf','question_answer',
                                 'curation_request')),
  title        text,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  actor        text        NOT NULL,   -- signed-in identity; household rating, attributed entry
  created_at   timestamptz NOT NULL DEFAULT now(),
  consumed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS pending_unconsumed_idx
  ON pending_actions (created_at) WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Recommendation surfaces. Generated outside the app and pushed in; the app never infers.
-- predicted_stars is present from the outset so calibration pairs have somewhere to
-- land without a later migration against live data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slate (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tmdb_id         integer,
  title           text        NOT NULL,
  type            title_type  NOT NULL,
  why             text,                 -- the one-line case shown on the card
  rationale       text,                 -- longer case layer, incl. its honest caveat
  -- Facts layer, kept apart from the two case-layer columns above because the design
  -- separates them visually and they carry different warrants: a badge is a claim
  -- someone verified this cycle ("one season, arc closes"), not a catalogue fact and
  -- not an argument. Catalogue facts stay owned by title_meta and are read by join.
  badges          text[],
  predicted_stars star_rating,          -- hidden in v1 UI; pairs against the actual rating
  position        integer     NOT NULL,
  state           text        NOT NULL DEFAULT 'buffered'
                    CHECK (state IN ('buffered','shown','resolved')),
  -- When this row's prediction was closed against an actual rating. Separate from state
  -- on purpose: state is a DISPLAY fact (which card is on screen) and paired_at is a
  -- CALIBRATION fact (has this prediction been scored). They were the same column once,
  -- and it silently destroyed the calibration record — a `seen it` verdict resolved the
  -- row immediately, so the rating that followed a moment later found nothing left to
  -- pair against and emit_prediction returned None without saying so.
  paired_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS slate_state_idx ON slate (state, position);

CREATE TABLE IF NOT EXISTS similars (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anchor_title    text        NOT NULL,
  tmdb_id         integer,
  title           text        NOT NULL,
  type            title_type  NOT NULL,
  curated         boolean     NOT NULL DEFAULT false,  -- false = raw TMDB, shown marked as such
  badges          text[],                                -- see slate.badges
  predicted_stars star_rating,
  position        integer     NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS similars_anchor_idx ON similars (anchor_title, position);

CREATE TABLE IF NOT EXISTS question_queue (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question     text        NOT NULL,
  provenance   text,                    -- what the answer is evidence about
  rank         integer     NOT NULL,    -- by information value, never completeness
  asked_at     timestamptz,
  answered_at  timestamptz,
  skipped      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_pending_idx
  ON question_queue (rank) WHERE answered_at IS NULL AND skipped = false;

-- Added after first apply. This file is the schema of record and re-runnable from empty, but
-- CREATE TABLE IF NOT EXISTS is a no-op against a table that already exists, so a column
-- added after first apply needs its own idempotent statement or the live database and
-- this file silently disagree.
ALTER TABLE slate    ADD COLUMN IF NOT EXISTS badges text[];
ALTER TABLE slate    ADD COLUMN IF NOT EXISTS paired_at timestamptz;
ALTER TABLE similars ADD COLUMN IF NOT EXISTS badges text[];

-- 'curation_request' added after first apply. A CHECK cannot be widened in place, and the app
-- writing a kind the constraint rejects would fail the whole verdict transaction.
-- The sync script must know the kind too: an unrouted kind is reported as a failure and
-- never consumed, so it would sit in pending_actions forever.
ALTER TABLE pending_actions DROP CONSTRAINT IF EXISTS pending_actions_kind_check;
ALTER TABLE pending_actions ADD CONSTRAINT pending_actions_kind_check
  CHECK (kind IN ('log','want','rerate','verdict','dnf','question_answer','curation_request'));

-- ---------------------------------------------------------------------------
-- TMDB poster/metadata cache. Pure cache — safe to drop and refetch.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS title_meta (
  tmdb_id      integer PRIMARY KEY,
  title        text        NOT NULL,
  type         title_type  NOT NULL,
  year         integer,
  poster_path  text,
  synopsis     text,
  raw          jsonb,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- The rate sheet announces a derived tier live, under the star control, as the user
-- drags. That is feedback, never input — but rendering it needs the mapping on
-- the client, and a second implementation in TypeScript is exactly the drift
-- shelf_tier_matches_stars exists to prevent.
--
-- So the client is handed a lookup table rather than a rule: the ten legal half steps,
-- each already resolved here. The client indexes into it; it never computes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tier_label(t smallint)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  -- Canonical labels, matching the spreadsheet writer's labels exactly (en dash, not hyphen).
  SELECT CASE t WHEN 1 THEN 'T1 – Loves' WHEN 2 THEN 'T2 – Likes' WHEN 3 THEN 'T3 – Fine'
                WHEN 4 THEN 'T4 – Meh'   WHEN 5 THEN 'T5 – Dislikes' END;
$$;

CREATE OR REPLACE VIEW star_tier_map AS
  SELECT s::star_rating          AS stars,
         tier_from_stars(s)      AS tier,
         tier_label(tier_from_stars(s)) AS tier_label
  FROM generate_series(1, 10) AS n, LATERAL (SELECT (n / 2.0)::numeric(2,1) AS s) x
  ORDER BY s;
