// lib/summary.ts — the two paths a restaurant summary can take.
// - aiSummary(): the real thing — sends the raw review rows to an LLM and asks
//   for a faithful 3-sentence overview. Used only when OPENAI_API_KEY is set.
// - quickSummary(): the honest fallback — sentences composed from computed
//   facts. Clearly labelled by the caller, never pretending to be AI.
//
// RULE OF THE HOUSE: this module receives FACTS and returns TEXT.
// No storing, no inventing — the prompt forbids the model from using
// anything that isn't in the review rows.

export type SummaryReview = {
  rating: number;
  comment: string;
  displayName: string | null;
  createdAtLabel: string;
  items: string[];
};

export type SummaryFacts = {
  restaurantName: string;
  averageRating: number | null;
  totalReviews: number;
  distribution: { rating: number; count: number }[];
  topVeg: { name: string; average: number }[];
  topNonVeg: { name: string; average: number }[];
  reviews: SummaryReview[];
};

export function quickSummary(facts: SummaryFacts): string {
  if (facts.totalReviews === 0) return "";

  const lines: string[] = [];

  lines.push(
    `${facts.restaurantName} holds a ${facts.averageRating} average from ${facts.totalReviews} review${facts.totalReviews === 1 ? "" : "s"}.`
  );

  const [topVeg] = facts.topVeg;
  const [topNonVeg] = facts.topNonVeg;
  if (topVeg && topNonVeg) {
    lines.push(
      `Reviewers keep coming back for the ${topVeg.name} (${topVeg.average.toFixed(1)}) among vegetarian picks and the ${topNonVeg.name} (${topNonVeg.average.toFixed(1)}) among non-vegetarian ones.`
    );
  }

  const high = facts.distribution.filter((d) => d.rating >= 4).reduce((sum, d) => sum + d.count, 0);
  const low = facts.distribution.filter((d) => d.rating <= 3).reduce((sum, d) => sum + d.count, 0);
  if (low > 0) {
    lines.push(
      `${high} of ${facts.totalReviews} recent reviews are 4★ or better; a few ${
        low === 1 ? "reviewer is" : "reviewers are"
      } less happy.`
    );
  }

  return lines.join(" ");
}

export async function aiSummary(
  facts: SummaryFacts,
  apiKey: string,
  model: string
): Promise<string | null> {
  const userPayload = {
    restaurant: facts.restaurantName,
    averageRating: facts.averageRating,
    instructions:
      "Write a 3-sentence overview for people deciding whether to eat here. Mention what is loved and what is criticised, using ONLY the reviews below. Do not invent any dish, name or fact.",
    reviews: facts.reviews.map((r) => ({
      rating: r.rating,
      comment: r.comment,
      reviewer: r.displayName ?? "anonymous",
      when: r.createdAtLabel,
      itemsEaten: r.items,
    })),
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 280,
        messages: [
          {
            role: "system",
            content:
              "You are a careful food review summariser. You never invent reviews, ratings, dishes or people. If the reviews don't support a claim, you leave it out.",
          },
          { role: "user", content: JSON.stringify(userPayload, null, 2) },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null; // any network fault → caller falls back to quickSummary
  }
}
