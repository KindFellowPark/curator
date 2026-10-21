-- Curator — fictional sample data for a fresh database.
--
-- Apply db/schema.sql first, then this file:
--   psql "$DATABASE_URL" -f db/schema.sql
--   psql "$DATABASE_URL" -f db/seed_sample.sql
--
-- The titles are real, well-known films and series; the ratings, notes and the two users
-- (alex@example.com, sam@example.com) are invented. tmdb_id is left NULL throughout, so
-- every title renders with the tinted placeholder block instead of a poster; search and
-- add a title in the app to see artwork.
--
-- Tier and its label are never typed here. They come from tier_from_stars() and
-- tier_label(), the same functions the shelf's CHECK constraint holds the data to.
-- Safe to re-run: keyed rows skip on conflict, the rest are guarded by NOT EXISTS.

BEGIN;

-- Shelf: what the household has watched. One unrated legacy row (stars NULL, tier only)
-- and one partial-extent rating show the two states the UI treats specially.
INSERT INTO shelf (title, type, stars, tier, tier_label, rewatchable, notes, extent)
SELECT v.title, v.type, v.stars::numeric(2,1),
       COALESCE(tier_from_stars(v.stars::numeric), v.legacy_tier),
       tier_label(COALESCE(tier_from_stars(v.stars::numeric), v.legacy_tier)),
       v.rewatchable, v.notes, v.extent
FROM (VALUES
  ('Paddington 2',             'Movie', 5.0, NULL::smallint, true,  'Pure comfort. Watched twice in one month.', NULL),
  ('Arrival',                  'Movie', 4.5, NULL,           true,  'The ending lands harder the second time.', NULL),
  ('The Grand Budapest Hotel', 'Movie', 4.0, NULL,           NULL,  NULL, NULL),
  ('Knives Out',               'Movie', 3.5, NULL,           false, 'Fun once; the twist does not survive a rewatch.', NULL),
  ('Tenet',                    'Movie', 2.0, NULL,           false, 'Too loud to follow on a weeknight.', NULL),
  ('Ted Lasso',                'TV',    4.5, NULL,           true,  NULL, 'S1-S2'),
  ('The Bear',                 'TV',    4.0, NULL,           NULL,  'Stressful in a good way.', 'S1'),
  ('Parks and Recreation',     'TV',    NULL, 2::smallint,   NULL,  'Legacy row: tier recorded, stars never captured.', NULL)
) AS v(title, type, stars, legacy_tier, rewatchable, notes, extent)
ON CONFLICT (title) DO NOTHING;

-- Watchlist: ranked couch queue. rank is app-side only.
INSERT INTO watchlist (title, type, source, added, notes, rank) VALUES
  ('Severance',                     'TV',    'friend',     '2026-08-02', 'Everyone keeps bringing it up.', 1),
  ('Past Lives',                    'Movie', 'review',     '2026-08-10', NULL,                             2),
  ('Everything Everywhere All at Once', 'Movie', 'rewatch list', '2026-08-15', NULL,                     3),
  ('Shogun',                        'TV',    'trailer',    '2026-08-20', 'Save for a long weekend.',      4)
ON CONFLICT (title) DO NOTHING;

-- Recommendation slate: authored outside the app and pushed in. All rows arrive
-- buffered; the For-you page promotes the first ones to shown on read.
INSERT INTO slate (title, type, why, rationale, badges, position)
SELECT v.title, v.type, v.why, v.rationale, v.badges, v.position
FROM (VALUES
  ('The Martian', 'Movie',
   'Problem-solving with a sense of humour, like Arrival without the grief.',
   'Matches the high marks for clever, warm science fiction. Caveat: long, and the middle drags for some viewers.',
   ARRAY['Single film', 'Light on gore'], 1),
  ('Only Murders in the Building', 'TV',
   'A cosy mystery for a household that liked Knives Out once.',
   'Short episodes suit weeknights. Caveat: the mystery format may wear thin the way the Knives Out twist did.',
   ARRAY['Half-hour episodes'], 2)
) AS v(title, type, why, rationale, badges, position)
WHERE NOT EXISTS (SELECT 1 FROM slate s WHERE s.title = v.title);

-- Pending actions: what the couch staged that the sync script has not replayed yet.
-- These drive the pending banner. Attributed to the fictional users.
INSERT INTO pending_actions (kind, title, payload, actor)
SELECT v.kind, v.title, v.payload::jsonb, v.actor
FROM (VALUES
  ('want', 'Shogun',
   '{"type": "TV", "source": "trailer", "notes": "Save for a long weekend."}',
   'sam@example.com'),
  ('log', 'The Bear',
   '{"type": "TV", "stars": "4.0", "rewatchable": null, "notes": "Stressful in a good way.", "reasons": [], "extent": "S1", "origin": "watchlist"}',
   'alex@example.com')
) AS v(kind, title, payload, actor)
WHERE NOT EXISTS (
  SELECT 1 FROM pending_actions p WHERE p.kind = v.kind AND p.title = v.title AND p.actor = v.actor
);

COMMIT;
