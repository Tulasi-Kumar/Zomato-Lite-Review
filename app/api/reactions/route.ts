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

  // Write the fact AND report the fresh count — in ONE statement.
  // The CTE "target" is empty for a nonexistent review (nothing gets inserted,
  // and the SELECT reports reviewOk: false instead of inventing a row).
  const resultRows = await db`
    WITH target AS (
      SELECT id FROM reviews WHERE id = ${reviewId}
    ),
    fresh AS (
      INSERT INTO reactions (review_id)
      SELECT id FROM target
      RETURNING id
    )
    SELECT
      EXISTS(SELECT 1 FROM target) AS "reviewOk",
      (SELECT COUNT(*)::int FROM reactions
       WHERE review_id = (SELECT id FROM target)) AS "reactions"
  `;
  if (!resultRows[0].reviewOk) {
    return Response.json({ error: "That review does not exist." }, { status: 400 });
  }
  return Response.json({ success: true, reactions: resultRows[0].reactions }, { status: 201 });
}
