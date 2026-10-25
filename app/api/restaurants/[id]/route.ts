// app/api/restaurants/[id]/route.ts
// GET /api/restaurants/[id] — the page-loader endpoint.
// Its job: run the THREE QUERIES that are the entire intelligence of this
// product, and shape the answer like the screen.

import { neon } from "@neondatabase/serverless";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

// Shaper: turns one raw database row into the review format the screen expects.
// Rows arrive as generic objects (the driver doesn't know our schema), so we
// convert each field explicitly here — and camelCase createdAt instead of
// snake_case created_at as a gift to the frontend.
function toReview(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    rating: row.rating as number,
    comment: row.comment as string,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export async function GET(
  _request: Request,
  // Next.js 16: dynamic params arrive as a Promise — we must await them.
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const restaurantId = Number(id);

  // A URL segment is always a string ("1"). If it isn't really a number,
  // or no restaurant matches it, this is a 404 — "nothing to see here".
  if (!Number.isInteger(restaurantId)) {
    return Response.json({ error: "Restaurant not found." }, { status: 404 });
  }

  const db = getDb();

  // FACT 0: does this restaurant exist at all?
  const restaurantRows = await db`
    SELECT name, cuisine, area
    FROM restaurants
    WHERE id = ${restaurantId}
  `;
  if (restaurantRows.length === 0) {
    return Response.json({ error: "Restaurant not found." }, { status: 404 });
  }
  const restaurant = restaurantRows[0];

  // FACT + ANSWER 1: the average. Computed NOW, in the database, from all rows.
  // AVG(rating) of zero rows is NULL — the database's way of saying "unknown".
  // COUNT(*) of zero rows is 0 — the database's way of saying "nothing yet".
  // So the empty state is NOT special-cased by me; it falls out of how the
  // database itself is defined. That is the decision, said out loud:
  //   no reviews -> averageRating: null, totalReviews: 0,
  //                 latestReview: null, reviews: []
  const statsRows = await db`
    SELECT AVG(rating)::float AS average, COUNT(*)::int AS total
    FROM reviews
    WHERE restaurant_id = ${restaurantId}
  `;
  const stats = statsRows[0];

  // Round to one decimal place HERE, in the backend. The frontend will
  // never do any maths — it prints what we hand it.
  const averageRating =
    stats.average === null ? null : Math.round(stats.average * 10) / 10;

  // FACT 2: every review for this restaurant, newest first.
  const allReviews = await db`
    SELECT id, rating, comment, created_at
    FROM reviews
    WHERE restaurant_id = ${restaurantId}
    ORDER BY created_at DESC
  `;

  const latestReview = allReviews.length > 0 ? toReview(allReviews[0]) : null;
  // All reviews EXCEPT the latest — the page shows the latest separately,
  // and nobody wants the same review printed twice.
  const reviews = allReviews.slice(1).map(toReview);

  // The response is shaped like the SCREEN:
  // name -> big rating -> latest review -> the rest.
  return Response.json({
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    area: restaurant.area,
    averageRating,
    totalReviews: stats.total,
    latestReview,
    reviews,
  });
}
