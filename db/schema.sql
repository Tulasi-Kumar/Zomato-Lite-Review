-- db/schema.sql
-- The blueprint of our database: two tables, nothing else.
-- A table is like a spreadsheet: columns across the top, rows of facts below.

-- Start clean, so this script can be run again safely.
-- (In real life you'd rarely drop tables — but this is a sandbox.)

DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS restaurants;

CREATE TABLE restaurants (
  id        SERIAL PRIMARY KEY,   -- SERIAL = "1, 2, 3... automatically number me"
  name      TEXT NOT NULL,        -- NOT NULL = "this column can never be empty"
  cuisine   TEXT NOT NULL,
  area      TEXT NOT NULL
);

CREATE TABLE reviews (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),  -- every review must point at a real restaurant
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), -- the database itself rejects 0 and 500
  comment       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- auto-filled "right now", stored timezone-aware
);

-- Note what is deliberately MISSING here:
--   no average_rating column
--   no latest_review column
-- Those are ANSWERS (computed from facts), not FACTS. Storing them means
-- having to update them every time — and forgetting once means lying to users.
