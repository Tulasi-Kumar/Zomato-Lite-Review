// app/api/reactions/route.ts
// POST /api/reactions — one tap of ♡ on a review = one new FACT row.
// The page later computes "helpfulness" as COUNT(*) at request time.
// (No identities exist in this app, so an attack could spam taps —
// the count can be inflated dishonestly, but no review content can
// be altered. The honest defence is per-browser session state on the
// front end, plus rate limiting in real products.)

import { neon } from "@neondatabase/serverless";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export async function POST(request: Request) {
  const db = getDb();

  let body: { reviewId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

  // CHECK 1: reviewId must be a whole number.
  if (!Number.isInteger(body.reviewId)) {
    return Response.json({ error: "reviewId must be a whole number." }, { status: 400 });
  }
  const reviewId = body.reviewId as number;

  // CHECK 2: that review must actually exist (database lookup).
  const rows = await db`SELECT id FROM reviews WHERE id = ${reviewId}`;
  if (rows.length === 0) {
    return Response.json({ error: "That review does not exist." }, { status: 400 });
  }

  // Write exactly one fact row.
  await db`INSERT INTO reactions (review_id) VALUES (${reviewId})`;

  // Reply with the FRESH count — computed now, not remembered from earlier.
  const [countRows] = await db`
    SELECT COUNT(*)::int AS count FROM reactions WHERE review_id = ${reviewId}
  `;
  return Response.json({ success: true, reactions: countRows.count }, { status: 201 });
}
