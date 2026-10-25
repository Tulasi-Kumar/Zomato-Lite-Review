// app/api/restaurants/[id]/route.ts — V2, THE BRAIN.
// Every number the screen shows is computed RIGHT HERE, RIGHT NOW:
//   average       -> AVG(rating)
//   distribution  -> GROUP BY rating
//   topItems      -> AVG(rating) GROUP BY item
//   latest        -> ORDER BY created_at DESC LIMIT 1
//   badges        -> COUNT per reviewer
//   reactions     -> COUNT per review
//   relative time -> computed label, never raw ISO
//   summary       -> cached-if-fresh, else LLM, else quick fact summary

import { neon } from "@neondatabase/serverless";
import { aiSummary, quickSummary, type SummaryFacts, type SummaryReview } from "@/lib/summary";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

// Backends format things for humans. The frontend prints; we compute the words.
function relativeLabel(createdAt: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

// Badges are ANSWERS. They come from facts, they are never stored facts.
function badgeFor(displayName: string | null, reviewsBySamePerson: number): string | null {
  if (!displayName) return null;
  if (reviewsBySamePerson >= 3) return `Regular · ${reviewsBySamePerson} reviews`;
  if (reviewsBySamePerson === 2) return "Repeat visitor";
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const restaurantId = Number(id);
  if (!Number.isInteger(restaurantId)) {
    return Response.json({ error: "Restaurant not found." }, { status: 404 });
  }

  const db = getDb();

  const restaurantRows = await db`
    SELECT name, cuisine, area FROM restaurants WHERE id = ${restaurantId}
  `;
  if (restaurantRows.length === 0) {
    return Response.json({ error: "Restaurant not found." }, { status: 404 });
  }
  const restaurant = restaurantRows[0];

  // ---- THE NUMBERS (computed fresh, every load) ----
  const statsRows = await db`
    SELECT AVG(rating)::float AS average, COUNT(*)::int AS total
    FROM reviews WHERE restaurant_id = ${restaurantId}
  `;
  const stats = statsRows[0];
  const averageRating =
    stats.average === null ? null : Math.round(stats.average * 10) / 10;

  // Rating distribution — a complete 1..5 table with ready-to-print bar widths.
  // (The frontend prints {percent}% widths; IT never computes percentages.)
  const distributionRows = await db`
    SELECT rating, COUNT(*)::int AS count
    FROM reviews WHERE restaurant_id = ${restaurantId}
    GROUP BY rating
  `;
  const countByRating = new Map(distributionRows.map((r) => [r.rating, r.count]));
  const rawDistribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: countByRating.get(rating) ?? 0,
  }));
  const maxCount = Math.max(1, ...rawDistribution.map((d) => d.count));
  const distribution = rawDistribution.map((d) => ({
    ...d,
    percent: Math.round((d.count / maxCount) * 100),
  }));

  // ---- THE REVIEWS ----
  const allReviews = await db`
    SELECT id, rating, comment, display_name, created_at
    FROM reviews WHERE restaurant_id = ${restaurantId}
    ORDER BY created_at DESC
  `;

  // Which items did each review claim? Loaded once, joined in code.
  const itemRows = await db`
    SELECT review_items.review_id, menu_items.name
    FROM review_items JOIN menu_items ON menu_items.id = review_items.item_id
    WHERE menu_items.restaurant_id = ${restaurantId}
  `;
  const itemsByReview = new Map<number, string[]>();
  for (const row of itemRows) {
    itemsByReview.set(row.review_id, [...(itemsByReview.get(row.review_id) ?? []), row.name]);
  }

  // How helpful is each review, right now?
  const reactionRows = await db`
    SELECT reviews.id, COUNT(*)::int AS count
    FROM reactions JOIN reviews ON reviews.id = reactions.review_id
    WHERE reviews.restaurant_id = ${restaurantId}
    GROUP BY reviews.id
  `;
  const reactionsByReview = new Map(reactionRows.map((r) => [r.id, r.count]));

  // Who reviews how often? (powering badges)
  const personRows = await db`
    SELECT display_name, COUNT(*)::int AS count
    FROM reviews WHERE restaurant_id = ${restaurantId} AND display_name IS NOT NULL
    GROUP BY display_name
  `;
  const reviewsByPerson = new Map(personRows.map((r) => [r.display_name, r.count]));

  function shapeReview(row: Record<string, unknown>) {
    const name = (row.display_name as string | null) ?? null;
    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      displayName: name,
      items: itemsByReview.get(row.id as number) ?? [],
      reactions: reactionsByReview.get(row.id as number) ?? 0,
      badge: badgeFor(name, name ? (reviewsByPerson.get(name) ?? 0) : 0),
      createdAt: (row.created_at as Date).toISOString(),
      createdAtLabel: relativeLabel(row.created_at as Date),
    };
  }

  const latestReview = allReviews.length > 0 ? shapeReview(allReviews[0]) : null;
  const reviews = allReviews.slice(1).map(shapeReview);

  // ---- MUST-TRY ITEMS (computed live) ----
  // Raw item average is a fact: SUM(reviews)/COUNT(reviews).
  // The must-try score is our ranking OPINION layered on those facts, and it
  // weighs BOTH the item's average AND how many reviews stand behind it —
  // the Bayesian weighted rating (what IMDb Top 250 does):
  //
  //   score = (v / (v + M)) * itemAvg + (M / (v + M)) * overallAvg
  //
  // A lonely 5.0 gets pulled toward the restaurant's overall average (4.3),
  // while a 4.75 earned across four reviews stands nearly unshaken.
  const PRIOR_REVIEWS = 3; // M — reviews before an item "speaks for itself"
  const overallAverage = averageRating ?? 0;

  const itemStatsRows = await db`
    SELECT menu_items.name, menu_items.kind,
           AVG(reviews.rating)::float AS average, COUNT(*)::int AS count
    FROM review_items
    JOIN menu_items ON menu_items.id = review_items.item_id
    JOIN reviews ON reviews.id = review_items.review_id
    WHERE reviews.restaurant_id = ${restaurantId}
    GROUP BY menu_items.name, menu_items.kind
  `;

  function weighted(itemAverage: number, reviewCount: number): number {
    const confidence = reviewCount / (reviewCount + PRIOR_REVIEWS);
    const score = confidence * itemAverage + (1 - confidence) * overallAverage;
    return Math.round(score * 10) / 10;
  }

  function shapeItem(r: Record<string, unknown>) {
    const rawAverage = r.average as number;
    const average = Math.round(rawAverage * 10) / 10;
    const reviewCount = (r.count as number) ?? 0;
    return {
      name: r.name as string,
      kind: r.kind as string,
      average,                             // the fact, shown honestly
      score: weighted(average, reviewCount), // our weighted opinion, used for ranking
      reviewCount,
    };
  }

  const veg = itemStatsRows
    .filter((r) => r.kind === "veg")
    .map(shapeItem)
    .sort((a, b) => b.score - a.score);
  const nonVeg = itemStatsRows
    .filter((r) => r.kind === "non_veg")
    .map(shapeItem)
    .sort((a, b) => b.score - a.score);
  const topItems = {
    veg: veg.slice(0, 1),       // the ONE must-try veg item
    nonVeg: nonVeg.slice(0, 3), // the top 3 non-veg
  };

  // ---- THE SUMMARY (the one approved cache) ----
  let summary: { kind: "ai" | "quick"; text: string } | null = null;
  if (stats.total > 0) {
    const cachedRows = await db`
      SELECT summary_text, review_count_at_generation
      FROM ai_summaries WHERE restaurant_id = ${restaurantId}
    `;
    if (cachedRows.length > 0 && cachedRows[0].review_count_at_generation === stats.total) {
      summary = { kind: "ai", text: cachedRows[0].summary_text };
    } else {
      const facts: SummaryFacts = {
        restaurantName: restaurant.name,
        averageRating,
        totalReviews: stats.total,
        distribution,
        topVeg: veg,
        topNonVeg: nonVeg,
        reviews: allReviews.map((row): SummaryReview => ({
          rating: row.rating,
          comment: row.comment,
          displayName: row.display_name,
          createdAtLabel: relativeLabel(row.created_at),
          items: itemsByReview.get(row.id) ?? [],
        })),
      };

      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      let text = apiKey ? await aiSummary(facts, apiKey, model) : null;

      if (text) {
        // Cache the ANSWER with the COUNT that produced it — the exception the PM approved
        await db`
          INSERT INTO ai_summaries (restaurant_id, summary_text, review_count_at_generation)
          VALUES (${restaurantId}, ${text}, ${stats.total})
          ON CONFLICT (restaurant_id) DO UPDATE
          SET summary_text = ${text}, review_count_at_generation = ${stats.total}, generated_at = NOW()
        `;
        summary = { kind: "ai", text };
      } else {
        // No key, no fresh model output — show the honest quick version, store nothing.
        summary = { kind: "quick", text: quickSummary(facts) };
      }
    }
  }

  // The answering shape includes the menu too — the review form draws its
  // item chips from THIS list, so fakerjs cannot conjure menu items client-side.
  const menuRows = await db`
    SELECT id, name, kind FROM menu_items WHERE restaurant_id = ${restaurantId} ORDER BY id
  `;

  // ---- THE RESPONSE, shaped like the screen ----
  return Response.json({
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    area: restaurant.area,
    averageRating,
    totalReviews: stats.total,
    distribution,
    latestReview,
    reviews,
    topItems,
    menu: menuRows,
    summary,
  });
}
