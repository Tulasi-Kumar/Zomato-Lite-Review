'use client';

// app/restaurant/[id]/restaurant-screen.tsx — THE DINING AREA, Ember Edition.
// Fetches the API response, prints it. ZERO maths in this file:
// the backend already computed the average, the bar widths, the badges,
// the reaction counts, the item scores and the timestamps.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/theme-toggle';

// ---- Types, copied from the API contract ----
type ApiDistribution = { rating: number; count: number; percent: number };
type ApiItem = { name: string; kind: string; average: number; score: number; reviewCount: number };
type ApiMenu = { id: number; name: string; kind: string };
type ApiReview = {
  id: number;
  rating: number;
  comment: string;
  displayName: string | null;
  items: string[];
  reactions: number;
  badge: string | null;
  createdAtLabel: string;
};
type ApiSummary = { kind: 'ai' | 'quick'; text: string };
type ApiRestaurant = {
  name: string;
  cuisine: string;
  area: string;
  averageRating: number | null;
  totalReviews: number;
  distribution: ApiDistribution[];
  latestReview: ApiReview | null;
  reviews: ApiReview[];
  topItems: { veg: ApiItem[]; nonVeg: ApiItem[] };
  menu: ApiMenu[];
  summary: ApiSummary | null;
};

// Small presentational helpers (string/cosmetic only — no arithmetic).
function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function Stars({ count }: { count: number }) {
  return (
    <span className="text-sm tracking-wider text-ember" aria-label={`${count} out of 5 stars`}>
      {'★'.repeat(count)}
      <span className="text-cream-muted/40">{'★'.repeat(5 - count)}</span>
    </span>
  );
}

function Avatar({ name }: { name: string | null }) {
  if (!name) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-cream-muted">
        <span className="text-sm">?</span>
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember/15 text-sm font-semibold text-ember">
      {initials(name)}
    </div>
  );
}

function ItemTag({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-cream-muted">
      {label}
    </span>
  );
}

// One review card — used for the latest (highlighted) and the rest (plain).
function ReviewCard({
  review,
  highlighted,
  reacted,
  pending,
  onReact,
}: {
  review: ApiReview;
  highlighted: boolean;
  reacted: boolean;
  pending: boolean;
  onReact: (reviewId: number) => void;
}) {
  const heart = reacted ? '♥' : '♡';
  return (
    <article
      className={
        highlighted
          ? 'rounded-2xl border border-ember/40 bg-surface-raised p-5'
          : 'rounded-2xl border border-line bg-surface p-5'
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={review.displayName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-cream">
            {review.displayName ?? 'Anonymous'}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Stars count={review.rating} />
            <span className="text-xs text-cream-muted">{review.createdAtLabel}</span>
            {review.badge && (
              <span className="rounded-full bg-ember/15 px-2 py-0.5 text-[11px] text-ember">
                {review.badge}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-cream">{review.comment}</p>

      {review.items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.items.map((label) => (
            <ItemTag key={label} label={label} />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onReact(review.id)}
          disabled={pending}
          className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed ${
            reacted
              ? 'border-ember/40 bg-ember/15 text-ember'
              : 'border-line text-cream-muted hover:border-ember/40 hover:text-ember'
          }`}
          aria-pressed={reacted}
          aria-label={reacted ? 'Remove your reaction' : 'Helpful'}
          title={reacted ? 'You reacted — tap to take it back' : 'Helpful'}
        >
          <span aria-hidden>{heart}</span>
          <span>{review.reactions}</span>
        </button>
        {reacted && (
          <span className="text-[11px] text-cream-muted">tap again to revoke</span>
        )}
      </div>
    </article>
  );
}

// Which taps were MINE? Per-browser memory so a reaction can be revoked even
// after a refresh. Our SECOND conscious localStorage exception (after theme).
const MY_REACTIONS_KEY = 'zl-my-reactions';

function readMyReactions(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(MY_REACTIONS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function rememberMyReaction(reviewId: number, reactionId: number) {
  try {
    const all = readMyReactions();
    all[String(reviewId)] = reactionId;
    window.localStorage.setItem(MY_REACTIONS_KEY, JSON.stringify(all));
  } catch {
    /* private-browsing guards etc. — undo simply won't survive a refresh */
  }
}

function forgetMyReaction(reviewId: number) {
  try {
    const all = readMyReactions();
    delete all[String(reviewId)];
    window.localStorage.setItem(MY_REACTIONS_KEY, JSON.stringify(all));
  } catch {
    /* nothing to do */
  }
}

function forget(prev: Record<number, number>, reviewId: number): Record<number, number> {
  const next = { ...prev };
  delete next[reviewId];
  return next;
}

import { QUESTIONS } from '@/lib/ask';

// Ask the chef — the clickable question deck. Clicking a chip asks the
// BACKEND, which either prints a cached AI answer, asks the real model,
// or falls back to honest fact text. This file only prints answers.
function AskChef({ restaurantId, hasVegReviews, hasNonVegReviews }: {
  restaurantId: string;
  hasVegReviews: boolean;
  hasNonVegReviews: boolean;
}) {
  const [answer, setAnswer] = useState<{ question: string; text: string; kind: 'ai' | 'quick' } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  // Only questions the facts can actually feed appear on the deck.
  const deck = Object.entries(QUESTIONS).filter(([key]) => {
    if (key === 'topVeg') return hasVegReviews;
    if (key === 'topNonVeg') return hasNonVegReviews;
    if (key === 'mustTry3') return hasVegReviews || hasNonVegReviews;
    return true;
  });

  async function ask(questionKey: string) {
    if (asking) return;
    setAsking(questionKey);
    setAnswer(null);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: Number(restaurantId), questionKey }),
      });
      if (!res.ok) throw new Error('ask failed');
      const data = (await res.json()) as { question: string; answer: string; kind: 'ai' | 'quick' };
      setAnswer({ question: data.question, text: data.answer, kind: data.kind });
    } catch {
      setAnswer({
        question: QUESTIONS[questionKey],
        text: 'The chef is not answering right now — try again in a moment.',
        kind: 'quick',
      });
    } finally {
      setAsking(null);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-ember/25 bg-surface p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-ember">
        <span aria-hidden>✦</span> Ask the chef
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {deck.map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => ask(key)}
            disabled={asking !== null}
            className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              asking === key
                ? 'border-ember bg-ember/15 text-ember'
                : 'border-line text-cream-muted hover:border-ember/50 hover:text-ember'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
      {asking && (
        <div className="mt-4 space-y-2" role="status" aria-label="Thinking">
          <div className="h-3 w-11/12 animate-pulse rounded bg-surface-raised" />
          <div className="h-3 w-8/12 animate-pulse rounded bg-surface-raised" />
        </div>
      )}
      {answer && !asking && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-cream-muted">
            {answer.question}
            <span className="ml-2 text-ember">
              {answer.kind === 'ai' ? '✦ AI concierge' : '· quick facts, no AI key yet'}
            </span>
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-cream">{answer.text}</p>
        </div>
      )}
    </section>
  );
}

export default function RestaurantScreen({ id }: { id: string }) {
  const [restaurant, setRestaurant] = useState<ApiRestaurant | null>(null);
  const [failed, setFailed] = useState(false);
  // reviewId → the id of MY fact row for that review (undefined = I haven't reacted).
  const [myReactions, setMyReactions] = useState<Record<number, number>>({});
  const [tapping, setTapping] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/restaurants/${id}`)
      .then((res) => {
        if (res.status === 404) throw new Error('not found');
        return res.json();
      })
      .then((data: ApiRestaurant) => {
        if (!cancelled) setRestaurant(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Which taps were MINE? Remembered per browser (localStorage — our second
  // conscious rule-bend, next to the theme), so revoke survives a refresh.
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(MY_REACTIONS_KEY) ?? '{}');
      const restored: Record<number, number> = {};
      for (const [key, value] of Object.entries(stored)) {
        if (Number.isInteger(value)) restored[Number(key)] = value as number;
      }
      setMyReactions((prev) => ({ ...restored, ...prev }));
    } catch {
      /* a broken memory store must never break the page */
    }
  }, []);

  // ---------- Reactions: optimistic, toggleable, server-confirmed ----------

  // Prints a ±1 change INSTANTLY, before the network answers.
  function printCount(preview: ApiRestaurant | null, reviewId: number, delta: number) {
    if (!preview) return preview;
    const bump = (r: ApiReview): ApiReview =>
      r.id === reviewId ? { ...r, reactions: Math.max(0, r.reactions + delta) } : r;
    return {
      ...preview,
      latestReview: preview.latestReview ? bump(preview.latestReview) : null,
      reviews: preview.reviews.map(bump),
    };
  }

  // Prints the server's fresh, exact number once the database has spoken.
  function printExact(preview: ApiRestaurant | null, reviewId: number, count: number) {
    if (!preview) return preview;
    const fix = (r: ApiReview): ApiReview =>
      r.id === reviewId ? { ...r, reactions: count } : r;
    return {
      ...preview,
      latestReview: preview.latestReview ? fix(preview.latestReview) : null,
      reviews: preview.reviews.map(fix),
    };
  }

  async function toggleReaction(reviewId: number) {
    if (tapping.has(reviewId) || !restaurant) return;
    setTapping((prev) => new Set(prev).add(reviewId));

    const mine = myReactions[reviewId];
    const revoking = typeof mine === 'number' && mine > 0;

    // STEP 1 — optimism: the heart and count move THIS frame.
    setRestaurant((prev) => printCount(prev, reviewId, revoking ? -1 : +1));
    setMyReactions((prev) => ({ ...prev, [reviewId]: revoking ? 0 : -1 }));

    try {
      if (revoking) {
        // STEP 2 — revoke: remove my fact row, then print the database's truth.
        const res = await fetch('/api/reactions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: mine }),
        });
        if (!res.ok) throw new Error('revoke failed');
        const data = (await res.json()) as { reactions: number | null };
        if (typeof data.reactions === 'number') {
          setRestaurant((prev) => printExact(prev, reviewId, data.reactions as number));
        }
        setMyReactions((prev) => forget(prev, reviewId));
        forgetMyReaction(reviewId);
      } else {
        // STEP 2 — react: one fact row, whose id comes back for future undo.
        const res = await fetch('/api/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewId }),
        });
        if (!res.ok) throw new Error('react failed');
        const data = (await res.json()) as { reactions: number; id: number };
        setRestaurant((prev) => printExact(prev, reviewId, data.reactions));
        setMyReactions((prev) => ({ ...prev, [reviewId]: data.id }));
        rememberMyReaction(reviewId, data.id);
      }
    } catch {
      // STEP 3 — honesty: if the server never agreed, undo the optimism.
      setRestaurant((prev) => printCount(prev, reviewId, revoking ? +1 : -1));
      setMyReactions((prev) => (revoking ? { ...prev, [reviewId]: mine } : forget(prev, reviewId)));
      if (!revoking) forgetMyReaction(reviewId);
    } finally {
      setTapping((prev) => {
        const next = new Set(prev);
        next.delete(reviewId);
        return next;
      });
    }
  }

  // Skeleton loading — the page fills with shimmering placeholders until data lands.
  if (failed) {
    return (
      <main className="min-h-screen bg-background px-6 py-24 text-cream">
        <div className="mx-auto max-w-[560px]">
          <p className="text-lg font-medium">Restaurant not found.</p>
          <p className="mt-2 text-sm text-cream-muted">
            There is no restaurant with the id “{id}”.
          </p>
        </div>
      </main>
    );
  }

  if (!restaurant) {
    return (
      <main className="min-h-screen bg-background px-6 py-16 text-cream">
        <div className="mx-auto max-w-[560px] space-y-6">
          <div className="h-9 w-2/3 animate-pulse rounded-lg bg-surface" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
          <div className="h-24 animate-pulse rounded-2xl bg-surface" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface" />
        </div>
      </main>
    );
  }

  const { name, cuisine, area, averageRating, totalReviews, distribution, latestReview, reviews, topItems, summary } =
    restaurant;

  return (
    <main className="min-h-screen bg-background px-6 pb-32 py-12 pt-12 text-cream">
      <div className="mx-auto max-w-[560px]">
        <ThemeToggle />

        {/* ---------- Header ---------- */}
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-ember">Ludhiana · Sector 32</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-sm text-cream-muted">{cuisine} · {area}</p>
        </header>

        {totalReviews === 0 ? (
          /* ---------- Honest empty state ---------- */
          <section className="mt-14 rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="text-6xl font-extralight text-line">★</p>
            <p className="mt-4 text-lg font-medium">No reviews yet.</p>
            <p className="mt-2 text-sm text-cream-muted">
              {name} just opened its review book. Be the first voice.
            </p>
            <Link
              href={`/review/${id}`}
              className="mt-6 inline-block rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-[#1a1408] transition-colors hover:bg-ember-dim"
            >
              Write the first review
            </Link>
          </section>
        ) : (
          <>
            {/* ---------- The big rating + distribution ---------- */}
            <section className="mt-10 flex items-start gap-6">
              <div>
                {/* PRINTED VERBATIM — the backend computed this number */}
                <p className="text-6xl font-bold tracking-tight text-ember">{averageRating}</p>
                <p className="mt-1 text-xs text-cream-muted">out of 5</p>
              </div>
              <div className="mt-2 flex-1 space-y-1.5">
                {/* Bar widths arrive as {percent} — printed, never computed here */}
                {distribution.map((d) => (
                  <div key={d.rating} className="flex items-center gap-2">
                    <span className="w-3 text-right text-xs text-cream-muted">{d.rating}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-ember"
                        style={{ width: `${d.percent}%` }}
                      />
                    </div>
                    <span className="w-6 text-xs text-cream-muted">{d.count}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ---------- The overview ---------- */}
            {summary && (
              <section
                className="mt-10 rounded-2xl border border-ember/25 bg-surface p-5"
              >
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-ember">
                  <span aria-hidden>✦</span>
                  {summary.kind === 'ai' ? 'AI overview' : 'Quick overview'}
                  {summary.kind !== 'ai' && (
                    <span className="font-normal normal-case tracking-normal text-cream-muted">
                      · add an AI key to upgrade
                    </span>
                  )}
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-cream">{summary.text}</p>
              </section>
            )}

            {/* ---------- Must try ---------- */}
            <section className="mt-10">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-cream-muted">Must try here</h2>
              {topItems.veg.length > 0 && (
                <div className="mt-4 rounded-2xl border border-veggie/30 bg-surface p-5">
                  <span className="rounded-full bg-veggie/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-veggie">
                    Top veg
                  </span>
                  <p className="mt-3 text-lg font-semibold">{topItems.veg[0].name}</p>
                  <p className="mt-0.5 text-sm text-cream-muted">
                    {topItems.veg[0].average} average · {topItems.veg[0].reviewCount}{' '}
                    {topItems.veg[0].reviewCount === 1 ? 'review' : 'reviews'}
                  </p>
                </div>
              )}
              {topItems.nonVeg.length > 0 && (
                <div className="mt-3 space-y-2.5">
                  {topItems.nonVeg.map((item, index) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between rounded-2xl border border-meat/25 bg-surface p-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-meat/15 text-xs font-bold text-meat">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-cream-muted">
                            {item.average} average · {item.reviewCount}{' '}
                            {item.reviewCount === 1 ? 'review' : 'reviews'}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-meat/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-meat">
                        Non-veg
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---------- Ask the chef ---------- */}
            <AskChef
              restaurantId={id}
              hasVegReviews={topItems.veg.length > 0}
              hasNonVegReviews={topItems.nonVeg.length > 0}
            />

            {/* ---------- Latest review, highlighted ---------- */}
            {latestReview && (
              <section className="mt-10">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-cream-muted">Latest review</h2>
                <div className="mt-4">
                  <ReviewCard
                    review={latestReview}
                    highlighted
                    reacted={myReactions[latestReview.id] !== undefined}
                    pending={tapping.has(latestReview.id)}
                    onReact={toggleReaction}
                  />
                </div>
              </section>
            )}

            {/* ---------- Older reviews ---------- */}
            {reviews.length > 0 && (
              <section className="mt-10">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-cream-muted">
                  Older reviews
                </h2>
                <div className="mt-4 space-y-3">
                  {reviews.map((review) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      highlighted={false}
                      reacted={myReactions[review.id] !== undefined}
                      pending={tapping.has(review.id)}
                      onReact={toggleReaction}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* The old in-flow CTA was removed: the pinned bottom bar below
                is ALWAYS reachable, no matter where you have scrolled. */}
          </>
        )}
      </div>

      {/* ---------- Pinned "Write a review" bar ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background/95 px-6 pb-4 pt-3 backdrop-blur">
        <div className="mx-auto max-w-[560px]">
          <Link
            href={`/review/${id}`}
            className="block rounded-xl bg-ember px-6 py-3.5 text-center text-sm font-semibold text-[#1a1408] transition-colors hover:bg-ember-dim"
          >
            Write a review
          </Link>
        </div>
      </div>
    </main>
  );
}
