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
  const restaurantRows = await db`SELECT id FROM restaurants WHERE id = ${restaurantId}`;
  if (restaurantRows.length === 0) {
    return bad("That restaurant does not exist.");
  }

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
  // restaurant's menu. Text like "I ate 900 burritos" gets washed in comment,
  // but a fake item id cannot enter the facts tables.
  let itemIds: number[] = [];
  if (body.items !== undefined && body.items !== null) {
    if (!Array.isArray(body.items) || body.items.some((id) => !Number.isInteger(id))) {
      return bad("Items must be a list of whole numbers.");
    }
    const requested = body.items as number[];
    // load this restaurant's real menu ONCE, compare in code
    const menuRows = await db`SELECT id FROM menu_items WHERE restaurant_id = ${restaurantId}`;
    const menuItemIds = new Set(menuRows.map((row) => row.id));
    if (requested.some((id) => !menuItemIds.has(id))) {
      return bad("Some selected items are not on this restaurant's menu.");
    }
    if (requested.length > 5) {
      return bad("Pick at most 5 items per review.");
    }
    itemIds = requested;
  }

  // ---------- WRITE THE FACTS ----------

  const inserted = await db`
    INSERT INTO reviews (restaurant_id, rating, comment, display_name)
    VALUES (${restaurantId}, ${body.rating}, ${(body.comment as string).trim()}, ${displayName})
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

  return Response.json({ success: true, reviewId }, { status: 201 });
}
