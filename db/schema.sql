-- db/schema.sql
-- The blueprint of our database. V2 "Ember Edition".
-- A table is like a spreadsheet: columns across the top, rows of facts below.
-- This file is IDEMPOTENT: safe to run on an empty database OR on a live one.
-- No DROP statements — we never destroy facts that already exist.

-- Fact tables ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS restaurants (
  id        SERIAL PRIMARY KEY,   -- SERIAL = "1, 2, 3... automatically number me"
  name      TEXT NOT NULL,        -- NOT NULL = "this column can never be empty"
  cuisine   TEXT NOT NULL,
  area      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT NOT NULL,
  display_name  TEXT,               -- optional, human-typed fact; NULL = anonymous
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('veg', 'non_veg'))
);

CREATE TABLE IF NOT EXISTS review_items (
  id        SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL REFERENCES menu_items(id),
  UNIQUE (review_id, item_id)      -- the same review can't claim the same item twice
);

CREATE TABLE IF NOT EXISTS reactions (
  id        SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The ONE approved exception (the PM approved this consciously):
-- a cached AI answer, refreshed whenever the review count changes.
CREATE TABLE IF NOT EXISTS ai_summaries (
  restaurant_id            INTEGER PRIMARY KEY REFERENCES restaurants(id),
  summary_text             TEXT NOT NULL,
  review_count_at_generation INTEGER NOT NULL,
  generated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same exception family, extended for "Ask the chef": per-QUESTION cached AI
-- answers, invalidated the same way (review count changed = stale). V2.6.
CREATE TABLE IF NOT EXISTS ai_answers (
  restaurant_id             INTEGER NOT NULL REFERENCES restaurants(id),
  question_key              TEXT NOT NULL,
  answer_text               TEXT NOT NULL,
  review_count_at_generation INTEGER NOT NULL,
  generated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (restaurant_id, question_key)
);

-- Upgrade path for databases created before V2 -------------------------------
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Note what is STILL deliberately missing:
--   no average_rating column
--   no latest_review column
--   no item_rating column          <- item scores are COMPUTED from review_items
--   no reactions_count column      <- "helpful" is COUNT(*) at request time
--   no badges column               <- badges are computed from counts
-- Facts only. Every answer is computed fresh by the backend.
