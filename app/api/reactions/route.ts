// app/api/reactions/route.ts
// POST /api/reactions   — one tap of ♡ = one new FACT row, whose id is returned.
// DELETE /api/reactions — a reaction can be revoked: the row it names is removed.
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
  // "fresh" is referenced exactly once — Postgres allows a data-modifying CTE
  // to be read only once per statement.
  //
  // POSTGRES SNAPSHOT RULE, learned the hard way: every statement in a WITH
  // runs on the SAME snapshot — the counting SELECT cannot see the INSERT's
  // new row. The count below is therefore the BEFORE count, and Postgres
  // guarantees "fresh" contributed exactly one row (review_id is our single
  // new fact), so +1 completes the arithmetic HERE, in the backend, where
  // all maths lives.
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
       WHERE review_id = (SELECT id FROM target)) + 1 AS "reactions",
      (SELECT id FROM fresh) AS "id"
  `;
  if (!resultRows[0].reviewOk) {
    return Response.json({ error: "That review does not exist." }, { status: 400 });
  }
  const row = resultRows[0];
  return Response.json(
    { success: true, reactions: row.reactions, id: row.id },
    { status: 201 }
  );
}

// DELETE /api/reactions — the undo of ♡. The browser sends back the reaction id
// the POST gave it; that exact fact row is removed, and the fresh count returns.
// In one statement: the data-modifying CTE "gone" is counted through the
// intermediate CTE "counted" (single reference rule, again).
export async function DELETE(request: Request) {
  const db = getDb();

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

  if (!Number.isInteger(body.id)) {
    return Response.json({ error: "id must be a whole number." }, { status: 400 });
  }
  const reactionId = body.id as number;

  const countedRows = await db`
    WITH gone AS (
      DELETE FROM reactions WHERE id = ${reactionId}
      RETURNING review_id
    ),
    counted AS (
      SELECT review_id FROM gone
    )
    SELECT
      (SELECT COUNT(*)::int FROM reactions WHERE review_id = counted.review_id) - 1 AS "reactions"
    FROM counted
  `;
  // The -1: same snapshot rule as POST — the counting SELECT still sees the
  // deleted row in its pre-delete snapshot, so we subtract our exact one row
  // (id is unique, DELETE can only have removed exactly this one).

  // Zero rows = there was nothing to remove (already revoked, or never ours).
  // Success either way — the end state is "reaction not present", which is
  // exactly what the browser asked for. reactions: null tells the client to
  // keep its optimistic number.
  if (countedRows.length === 0) {
    return Response.json({ success: true, reactions: null }, { status: 200 });
  }
  return Response.json({ success: true, reactions: countedRows[0].reactions }, { status: 200 });
}
