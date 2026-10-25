// lib/ask.ts — "Ask the chef": the question deck and its two answering paths.
// - aiAsk():       the REAL thing — the fresh fact pack goes to an LLM, which
//                  answers using ONLY those facts. Used when OPENAI_API_KEY exists.
// - quickAnswer(): the honest fallback — a sentence the backend composes
//                  from computed facts. Labelled 'quick', never pretending to be AI.
//
// RULE OF THE HOUSE (unchanged): the prompt forbids the model from inventing
// anything; the facts are assembled HERE from the database, computed fresh.

export const QUESTIONS: Record<string, string> = {
  mustTry3: "What are the top 3 must-try dishes here?",
  topVeg: "Which veg item should I order first?",
  topNonVeg: "Which non-veg item should I order first?",
  vibe: "Who is this place for, in one line?",
};

export type AskFacts = {
  questionKey: string;
  question: string;
  restaurantName: string;
  cuisine: string;
  averageRating: number | null;
  totalReviews: number;
  topVeg: { name: string; average: number; reviewCount: number; score: number }[];
  topNonVeg: { name: string; average: number; reviewCount: number; score: number }[];
  recentReviews: { rating: number; comment: string; itemsEaten: string[] }[];
};

// ---------- The honest fallback (no key, or the model is unreachable) ----------

export function quickAnswer(facts: AskFacts): string {
  if (facts.totalReviews === 0) {
    return "No reviews yet — there is nothing to chew on. Once a few voices land, this answers itself from their facts.";
  }

  const [topVeg] = facts.topVeg;
  const [topNonVeg] = facts.topNonVeg;

  switch (facts.questionKey) {
    case "mustTry3": {
      // Weighted score first, raw average only for display — the same rule the
      // screen's must-try cards obey: a lonely 5.0 must not outrank 4.8×4.
      const picks = [...facts.topVeg, ...facts.topNonVeg]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((p) => `${p.name} (${p.average.toFixed(1)} across ${p.reviewCount})`);
      return picks.length > 0
        ? `The highest-rated dishes right now: ${picks.join(", ")}.`
        : "Nobody has claimed a dish yet — order the obvious hero and be the first to name it.";
    }
    case "topVeg":
      return topVeg
        ? `Vegetarians keep rating the ${topVeg.name} highest (${topVeg.average.toFixed(1)} across ${topVeg.reviewCount} ${topVeg.reviewCount === 1 ? "review" : "reviews"}).`
        : "No veg dish has been reviewed yet — be the first voice.";
    case "topNonVeg":
      return topNonVeg
        ? `Non-vegetarians lean hardest on the ${topNonVeg.name} (${topNonVeg.average.toFixed(1)} across ${topNonVeg.reviewCount} ${topNonVeg.reviewCount === 1 ? "review" : "reviews"}).`
        : "No non-veg dish has been reviewed yet — be the first voice.";
    case "vibe":
      return `${facts.restaurantName} (${facts.cuisine}) reads as a ${facts.averageRating}★ neighbourhood spot from ${facts.totalReviews} ${facts.totalReviews === 1 ? "review" : "reviews"} — best suited to people who like honest, high-rated comfort food and can forgive a rough edge or two.`;
    default:
      return "That question is not on the menu yet.";
  }
}

// ---------- The real thing ----------

export async function aiAsk(
  facts: AskFacts,
  apiKey: string,
  model: string
): Promise<string | null> {
  const userPayload = {
    restaurant: { name: facts.restaurantName, cuisine: facts.cuisine },
    averageRating: facts.averageRating,
    totalReviews: facts.totalReviews,
    question: facts.question,
    answerRules:
      "Answer in 60 words or fewer. Use ONLY the facts and recent reviews below. Never invent a dish, person, price or event. If the facts are thin, say so briefly.",
    facts: {
      topVeg: facts.topVeg,
      topNonVeg: facts.topNonVeg,
      recentReviews: facts.recentReviews,
    },
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
        temperature: 0.6,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content:
              "You are Zomato Lite's chef concierge. You answer a diner's single question using ONLY the facts provided. You never invent reviews, ratings, dishes or people. Plain chatty text; at most 3 short numbered lines.",
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
    return null; // any fault → caller falls back to quickAnswer, honestly labelled
  }
}
