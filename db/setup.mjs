// db/setup.mjs — V2 migration version.
// - Applies schema.sql (idempotent: safe to run again and again)
// - Seeds menu items ONLY if the menu is empty
// - Seeds the pre-launch reviews ONLY if they aren't already there
// - Links the ORIGINAL 3 reviews to menu items so old facts join the new game
// - Seeds a few reactions ONLY if none exist
// It NEVER drops or deletes anything.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "schema.sql"), "utf8");

const db = neon(process.env.DATABASE_URL);

// A proper SQL statement splitter: cuts on ";" ONLY when the semicolon is
// outside single-quoted strings and outside "--" comments. (The naive
// split(";") broke on a comment that happened to contain a semicolon.)
function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inQuote = false;
  let inLineComment = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1] ?? "";
    if (inLineComment) {
      if (ch === "\n") { inLineComment = false; current += " "; }
      continue;
    }
    if (!inQuote && ch === "-" && next === "-") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      current += ch;
      if (inQuote) {
        if (next === "'") { current += "'"; i++; } // escaped '' inside a string
        else inQuote = false;
      } else {
        inQuote = true;
      }
      continue;
    }
    if (!inQuote && ch === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

const statements = splitStatements(schema);
console.log(`Parsed ${statements.length} SQL statements.`);

for (const statement of statements) {
  await db.query(statement);
}
console.log("Schema applied (no drops — existing facts untouched).");

// 2. Ensure the restaurant exists (fresh databases start empty).
const [restaurantCountRow] = await db`SELECT COUNT(*)::int AS count FROM restaurants`;
if (restaurantCountRow.count === 0) {
  await db`
    INSERT INTO restaurants (name, cuisine, area)
    VALUES ('Ludhiana Burrito', 'Indian', 'Sector 32')
  `;
  console.log("Restaurant seeded.");
} else {
  console.log("Restaurant already exists — left untouched.");
}

// 3. Seed the menu ONLY if empty.
const [menuCountRow] = await db`SELECT COUNT(*)::int AS count FROM menu_items`;
if (menuCountRow.count === 0) {
  await db`
    INSERT INTO menu_items (restaurant_id, name, kind) VALUES
      (1, 'Paneer Tikka Burrito',      'veg'),
      (1, 'Rajma Burrito',             'veg'),
      (1, 'Aloo Masala Burrito',       'veg'),
      (1, 'Cheese Corn Burrito',       'veg'),
      (1, 'Chicken Tikka Burrito',     'non_veg'),
      (1, 'Keema Burrito',             'non_veg'),
      (1, 'Butter Chicken Burrito',    'non_veg'),
      (1, 'Chicken Shawarma Burrito',  'non_veg')
  `;
  console.log("Menu seeded (4 veg, 4 non-veg).");
} else {
  console.log("Menu already seeded — left untouched.");
}

// 4. Link the three ORIGINAL reviews to menu items (facts they already imply).
for (const [commentText, itemId] of [
  ["Paneer burrito is unreal", 1],   // Paneer Tikka Burrito
  ["Good, but slow service", 5],     // Chicken Tikka Burrito
  ["Solid. Would repeat.", 2],       // Rajma Burrito
]) {
  const rows = await db`SELECT id FROM reviews WHERE comment = ${commentText} AND restaurant_id = 1`;
  if (rows.length > 0) {
    await db.query(
      `INSERT INTO review_items (review_id, item_id)
       SELECT ${rows[0].id}, ${itemId}
       WHERE NOT EXISTS (
         SELECT 1 FROM review_items WHERE review_id = ${rows[0].id} AND item_id = ${itemId}
       )`
    );
  }
}
console.log("Original reviews linked to menu items.");

// 5. Seed pre-launch reviews ONLY if the first of them isn't there yet.
const priyaExists = await db`
  SELECT id FROM reviews WHERE display_name = 'Priya Sharma' LIMIT 1
`;
if (priyaExists.length === 0) {
  // [displayName, rating, comment, ago-PostgreSQL interval, item ids]
  const seedReviews = [
    ["Priya Sharma",   5, "The paneer tikka burrito deserves its own fan club. Proper Ludhiana spice.",                    "3 days",   [1]],
    ["Simran Kaur",    5, "Butter chicken burrito is a crime against my diet plans. 10/10.",                              "4 days",   [7]],
    ["Rahul Verma",    4, "Keema burrito is juicy and bold. The wait crossed 20 minutes though.",                         "5 days",   [6]],
    ["Arjun Malhotra", 3, "Portions have shrunk lately. Taste is still fine but the value is not the same.",              "2 days",   [6, 4]],
    ["Neha Chawla",    4, "Rajma burrito is dal-level comfort wrapped in a tortilla.Weekday lunch regular.",              "1 day",    [2]],
    ["Vikram Singh",   2, "Chicken shawarma burrito arrived cold in the middle. Soggy wrap, not happy.",                  "26 hours", [8]],
    ["Tanvi Gupta",    5, "Aloo masala burrito — simple, filling, affordable. My fixed weekly order.",                    "12 hours", [3]],
    ["Deepak Kumar",   4, "Butter chicken burrito again, it is just that good. Staff is sweet.",                          "8 hours",  [7]],
    ["Meera Nair",     4, "Chicken tikka is smoky and strong, but honestly the veg options outshine the non-veg ones.",   "6 hours",  [5, 1]],
  ];

  for (const [displayName, rating, comment, ago, itemIds] of seedReviews) {
    const inserted = await db`
      INSERT INTO reviews (restaurant_id, rating, comment, display_name, created_at)
      VALUES (1, ${rating}, ${comment}, ${displayName}, NOW() - ${ago}::interval)
      RETURNING id
    `;
    const reviewId = inserted[0].id;
    for (const itemId of itemIds) {
      await db`
        INSERT INTO review_items (review_id, item_id)
        VALUES (${reviewId}, ${itemId})
        ON CONFLICT (review_id, item_id) DO NOTHING
      `;
    }
  }
  console.log(`Seeded ${seedReviews.length} pre-launch reviews.`);
} else {
  console.log("Pre-launch reviews already seeded — left untouched.");
}

// 6. Seed a few reactions ONLY if none exist, so "most helpful" has texture.
//    Paneer review gets the most love (it will rank as most helpful).
const [reactionCountRow] = await db`SELECT COUNT(*)::int AS count FROM reactions`;
if (reactionCountRow.count === 0) {
  const [paneer] = await db`SELECT id FROM reviews WHERE comment = 'Paneer burrito is unreal'`;
  const [butter] = await db`SELECT id FROM reviews WHERE display_name = 'Simran Kaur'`;
  const [keema]  = await db`SELECT id FROM reviews WHERE display_name = 'Rahul Verma'`;
  if (paneer) for (let i = 0; i < 5; i++) await db`INSERT INTO reactions (review_id) VALUES (${paneer.id})`;
  if (butter) for (let i = 0; i < 3; i++) await db`INSERT INTO reactions (review_id) VALUES (${butter.id})`;
  if (keema)  for (let i = 0; i < 1; i++) await db`INSERT INTO reactions (review_id) VALUES (${keema.id})`;
  console.log("Reactions seeded (paneer 5, butter 3, keema 1).");
} else {
  console.log("Reactions already exist — left untouched.");
}

// 7. Read everything back for the human eye.
const items = await db`SELECT id, name, kind FROM menu_items ORDER BY id`;
console.log("\nmenu_items:", items);

const reviewList = await db`
  SELECT id, display_name, rating, LEFT(comment, 40) AS comment, created_at
  FROM reviews ORDER BY created_at DESC
`;
console.log("\nreviews:", reviewList);

const [totals] = await db`
  SELECT COUNT(*)::int AS total, AVG(rating)::float AS avg FROM reviews WHERE restaurant_id = 1
`;
console.log(`\nTotal reviews: ${totals.total},  Live average: ${Math.round(totals.avg * 10) / 10}`);
