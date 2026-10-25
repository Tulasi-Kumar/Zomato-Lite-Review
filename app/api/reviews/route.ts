// app/api/reviews/route.ts — V2
// POST /api/reviews — the order window of the kitchen.
// Checks, in order, then writes: one review row + one review_items row per
// food item the reviewer ate. All of it is FACTS.

import { neon } from "@neondatabase/serverless";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

function bad(error: string) {
  return Response.json({ error }, { status: 400 });
}

export async function POST(request: Request) {
  const db = getDb();

  let body: {
    restaurantId?: unknown;
    rating?: unknown;
    comment?: unknown;
    displayName?: unknown;
    items?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("The request body is not valid JSON.");
  }

  // ---------- THE CHECKS, IN ORDER ----------

  // CHECK 1: rating is an integer from 1 to 5.
  if (
    typeof body.rating !== "number" ||
    !Number.isInteger(body.rating) ||
    body.rating < 1 ||
    body.rating > 5
  ) {
    return bad("Rating must be a whole number from 1 to 5.");
  }

  // CHECK 2: comment is a non-empty string after trimming whitespace.
  if (typeof body.comment !== "string" || body.comment.trim().length === 0) {
    return bad("Comment cannot be empty.");
  }

  // CHECK 3: restaurantId is a whole number we can look up.
  if (!Number.isInteger(body.restaurantId)) {
    return bad("restaurantId must be a whole number.");
  }
  const restaurantId = body.restaurantId as number;

  // CHECK 4 (NEW): displayName is optional — but if present it must be a short string.
  let displayName: string | null = null;
  if (body.displayName !== undefined && body.displayName !== null) {
    if (typeof body.displayName !== "string") {
      return bad("Display name must be text.");
    }
    const trimmedName = body.displayName.trim();
    if (trimmedName.length > 30) {
      return bad("Display name must be 30 characters or fewer.");
    }
    displayName = trimmedName.length > 0 ? trimmedName : null;
  }

  // CHECK 5 (NEW): items — every claimed food item must REALLY exist on this
  // restaurant's menu. Local JS checks make the shape valid; the DATABASE
  // proves the ids are real.
  let itemIds: number[] = [];
  if (body.items !== undefined && body.items !== null) {
    if (!Array.isArray(body.items) || body.items.some((id) => !Number.isInteger(id))) {
      return bad("Items must be a list of whole numbers.");
    }
    if ((body.items as number[]).length > 5) {
      return bad("Pick at most 5 items per review.");
    }
    itemIds = body.items as number[];
  }

  // ---------- NETWORK WAVE 1: validation, one round trip ----------
  const [existRows, menuRows] = await Promise.all([
    db`SELECT id FROM restaurants WHERE id = ${restaurantId}`,
    itemIds.length > 0
      ? db`SELECT id FROM menu_items WHERE restaurant_id = ${restaurantId}`
      : Promise.resolve([] as { id: number }[]),
  ]);
  if (existRows.length === 0) {
    return bad("That restaurant does not exist.");
  }
  const menuItemIds = new Set(menuRows.map((row) => row.id));
  if (itemIds.some((id) => !menuItemIds.has(id))) {
    return bad("Some selected items are not on this restaurant's menu.");
  }

  const trimmedComment = (body.comment as string).trim();

  // ---------- NETWORK WAVE 2: write the facts, one round trip ----------
  // No items? A single insert.
  if (itemIds.length === 0) {
    const inserted = await db`
      INSERT INTO reviews (restaurant_id, rating, comment, display_name)
      VALUES (${restaurantId}, ${body.rating}, ${trimmedComment}, ${displayName})
      RETURNING id
    `;
    return Response.json({ success: true, reviewId: inserted[0].id }, { status: 201 });
  }

  // Items? One statement writes the review AND all item links atomically:
  // the CTE inserts the review, and unnest(string_to_array(...)) walks the
  // validated ids inside Postgres — no injection risk (ints were checked
  // in JS; the cast happens in the database).
  const idsString = itemIds.join(",");
  const inserted = await db`
    WITH new_review AS (
      INSERT INTO reviews (restaurant_id, rating, comment, display_name)
      VALUES (${restaurantId}, ${body.rating}, ${trimmedComment}, ${displayName})
      RETURNING id
    )
    INSERT INTO review_items (review_id, item_id)
    SELECT nr.id, i.item_id
    FROM new_review nr, unnest(string_to_array(${idsString}, ',')::int[]) AS i(item_id)
    RETURNING (SELECT id FROM new_review) AS review_id
  `;

  return Response.json({ success: true, reviewId: inserted[0].review_id }, { status: 201 });
}
