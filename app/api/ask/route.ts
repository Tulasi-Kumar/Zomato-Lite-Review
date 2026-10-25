// app/api/ask/route.ts — "Ask the chef"
// POST /api/ask  { restaurantId: number, questionKey: "mustTry3" | "topVeg" | "topNonVeg" | "vibe" }
//
// Flow: validate → ONE parallel wave of fact queries → print answer.
//   1. a FRESH cached answer (review count unchanged) prints instantly;
//   2. otherwise, with OPENAI_API_KEY, the fact pack goes to the real model
//      and the answer is cached;
//   3. with no key (or a model failure), the honest fact-based quickAnswer
//      prints, labelled 'quick' so the screen never pretends it was AI.
//
// The Bayesian ranking here is the SAME formula as restaurants/[id]/route.ts
// (score = v/(v+M)·itemAvg + M/(v+M)·overallAvg, M = 3) — keep them in step.

import { neon } from "@neondatabase/serverless";
import { QUESTIONS, aiAsk, quickAnswer, type AskFacts } from "@/lib/ask";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

const PRIOR_REVIEWS = 3; // M — same prior as the must-try ranking

export async function POST(request: Request) {
  const db = getDb();

  let body: { restaurantId?: unknown; questionKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body is not valid JSON." }, { status: 400 });
  }

  // CHECK 1: restaurantId is a whole number.
  if (!Number.isInteger(body.restaurantId)) {
    return Response.json({ error: "restaurantId must be a whole number." }, { status: 400 });
  }
  const restaurantId = body.restaurantId as number;

  // CHECK 2: the question must be one of OUR deck — importers and callers
  // cannot smuggle arbitrary prompts through this door (security + honesty).
  if (typeof body.questionKey !== "string" || !(body.questionKey in QUESTIONS)) {
    return Response.json(
      { error: `questionKey must be one of: ${Object.keys(QUESTIONS).join(", ")}.` },
      { status: 400 }
    );
  }
  const questionKey = body.questionKey as string;
  const question = QUESTIONS[questionKey];

  // ---------- NETWORK WAVE 1: every fact, all together ----------
  const [restaurantRows, statsRows, itemStatsRows, recentRows, cachedRows] = await Promise.all([
    db`SELECT name, cuisine FROM restaurants WHERE id = ${restaurantId}`,
    db`SELECT AVG(rating)::float AS average, COUNT(*)::int AS total
       FROM reviews WHERE restaurant_id = ${restaurantId}`,
    // per-item facts (the weighted score is computed HERE, in the backend)
    db`SELECT menu_items.name, menu_items.kind,
              AVG(reviews.rating)::float AS average, COUNT(*)::int AS count
       FROM review_items
       JOIN menu_items ON menu_items.id = review_items.item_id
       JOIN reviews ON reviews.id = review_items.review_id
       WHERE reviews.restaurant_id = ${restaurantId}
       GROUP BY menu_items.name, menu_items.kind`,
    // the five freshest voices give the model texture it can quote
    db`SELECT rating, comment, created_at
       FROM reviews WHERE restaurant_id = ${restaurantId}
       ORDER BY created_at DESC LIMIT 5`,
    // cache lookup rides the same wave (validity decided below, in code)
    db`SELECT answer_text, review_count_at_generation
       FROM ai_answers WHERE restaurant_id = ${restaurantId} AND question_key = ${questionKey}`,
  ]);

  if (restaurantRows.length === 0) {
    return Response.json({ error: "That restaurant does not exist." }, { status: 404 });
  }
  const restaurant = restaurantRows[0];
  const stats = statsRows[0];

  // ---------- Weighted must-try ranking (backend maths only) ----------
  const overallAverage = stats.average === null ? null : Math.round(stats.average * 10) / 10;
  function weighted(itemAverage: number, reviewCount: number): number {
    const confidence = reviewCount / (reviewCount + PRIOR_REVIEWS);
    return Math.round(
      (confidence * itemAverage + (1 - confidence) * (overallAverage ?? 0)) * 10
    ) / 10;
  }
  const rank = (kind: string) =>
    itemStatsRows
      .filter((row) => row.kind === kind)
      .map((row) => ({
        name: row.name,
        average: Math.round(row.average * 10) / 10,
        reviewCount: row.count,
        score: weighted(row.average, row.count),
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ name, average, reviewCount, score }) => ({ name, average, reviewCount, score }));

  // ---------- Choose what to say ----------
  // 1. Fresh cache? Zero cost, prints instantly.
  if (cachedRows.length > 0 && cachedRows[0].review_count_at_generation === stats.total) {
    return Response.json({
      question,
      answer: cachedRows[0].answer_text,
      kind: "ai",
    });
  }

  const facts: AskFacts = {
    questionKey,
    question,
    restaurantName: restaurant.name,
    cuisine: restaurant.cuisine,
    averageRating: overallAverage,
    totalReviews: stats.total,
    topVeg: rank("veg"),
    topNonVeg: rank("non_veg"),
    recentReviews: recentRows.map((row) => ({
      rating: row.rating,
      comment: row.comment,
      itemsEaten: [],
    })),
  };

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  // 2. Real model, then cache the answer.
  if (apiKey) {
    const text = await aiAsk(facts, apiKey, model);
    if (text) {
      await db`
        INSERT INTO ai_answers (restaurant_id, question_key, answer_text, review_count_at_generation)
        VALUES (${restaurantId}, ${questionKey}, ${text}, ${stats.total})
        ON CONFLICT (restaurant_id, question_key)
        DO UPDATE SET answer_text = ${text},
                     review_count_at_generation = ${stats.total},
                     generated_at = NOW()
      `;
      return Response.json({ question, answer: text, kind: "ai" });
    }
    // 3. fall through: the model refused/faulted — answer from facts, honestly.
  }

  return Response.json({ question, answer: quickAnswer(facts), kind: "quick" });
}
