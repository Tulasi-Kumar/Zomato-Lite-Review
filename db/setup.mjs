// db/setup.mjs
// Creates the two tables from schema.sql, then seeds one restaurant + three reviews.
// Run it with:  npm run db:setup

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "schema.sql"), "utf8");

// One database connection, built from the secret in .env.local
const db = neon(process.env.DATABASE_URL);

// 1. Run the blueprint, one statement at a time.
const statements = schema
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

for (const statement of statements) {
  await db.query(statement);
}
console.log("Tables created (or recreated).");

// 2. Seed: one restaurant, three reviews a few days apart,
//    so "latest review" is actually meaningful and not a tie.
await db`
  INSERT INTO restaurants (name, cuisine, area)
  VALUES ('Ludhiana Burrito', 'Indian', 'Sector 32')
`;
await db`
  INSERT INTO reviews (restaurant_id, rating, comment, created_at) VALUES
    (1, 5, 'Paneer burrito is unreal', NOW() - INTERVAL '8 days'),
    (1, 4, 'Good, but slow service',   NOW() - INTERVAL '6 days'),
    (1, 4, 'Solid. Would repeat.',     NOW() - INTERVAL '2 days')
`;
console.log("Seed data inserted.");

// 3. Read the rows back and print them, so you can see the facts with your own eyes.
const restaurants = await db`SELECT * FROM restaurants`;
const reviews = await db`SELECT * FROM reviews ORDER BY created_at DESC`;

console.log("\nrestaurants table:");
console.log(restaurants);

console.log("\nreviews table:");
console.log(reviews);
