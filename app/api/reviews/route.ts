// app/api/reviews/route.ts
// POST /api/reviews — the order window of the kitchen.
// Takes one review, checks it three ways, writes one row of FACTS.

import { neon } from "@neondatabase/serverless";

// One database connection, built from the secret in .env.local.
// (Next.js makes .env.local values available here in the backend, and ONLY here.)
function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

// "POST" is one of the HTTP verbs: GET means "read", POST means "write".
export async function POST(request: Request) {
  const db = getDb();

  // Read the body once. If the sender didn't even send valid JSON, reject early.
  let body: {
    restaurantId?: unknown;
    rating?: unknown;
    comment?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "The request body is not valid JSON." },
      { status: 400 } // 400 = "you sent me something invalid"
    );
  }

  // THE CHECKS, IN ORDER, IN PLAIN ENGLISH.
  // We do this because the frontend is just ONE polite visitor —
  // anyone with a terminal can talk to this API directly.

  // CHECK 1: rating must be a whole number from 1 to 5.
  if (
    typeof body.rating !== "number" ||
    !Number.isInteger(body.rating) ||
    body.rating < 1 ||
    body.rating > 5
  ) {
    return Response.json(
      { error: "Rating must be a whole number from 1 to 5." },
      { status: 400 }
    );
  }

  // CHECK 2: comment must be a non-empty string after trimming whitespace.
  if (typeof body.comment !== "string" || body.comment.trim().length === 0) {
    return Response.json(
      { error: "Comment cannot be empty." },
      { status: 400 }
    );
  }

  // CHECK 3: restaurantId must be a whole number before we even look it up.
  if (!Number.isInteger(body.restaurantId)) {
    return Response.json(
      { error: "restaurantId must be a whole number." },
      { status: 400 }
    );
  }

  const restaurantId = body.restaurantId as number;
  const comment = (body.comment as string).trim();

  // CHECK 4 (a real database lookup): the restaurant must actually exist.
  const restaurantRows = await db`
    SELECT id FROM restaurants WHERE id = ${restaurantId}
  `;
  if (restaurantRows.length === 0) {
    return Response.json(
      { error: "That restaurant does not exist." },
      { status: 400 }
    );
  }

  // Every check passed. Write EXACTLY ONE row of facts.
  // No average is touched here — averages don't exist as columns, remember?
  // RETURNING id asks the database to hand us back the row it just created.
  const inserted = await db`
    INSERT INTO reviews (restaurant_id, rating, comment)
    VALUES (${restaurantId}, ${body.rating}, ${comment.trim()})
    RETURNING id
  `;

  // 201 = "created". We return the new review's id so the caller knows it worked.
  return Response.json(
    { success: true, reviewId: inserted[0].id },
    { status: 201 }
  );
}
