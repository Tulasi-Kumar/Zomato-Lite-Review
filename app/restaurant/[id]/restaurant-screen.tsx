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
  onReact,
}: {
  review: ApiReview;
  highlighted: boolean;
  reacted: boolean;
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
          disabled={reacted}
          className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed ${
            reacted
              ? 'border-ember/40 bg-ember/15 text-ember'
              : 'border-line text-cream-muted hover:border-ember/40 hover:text-ember'
          }`}
          aria-pressed={reacted}
          aria-label="Helpful"
        >
          <span aria-hidden>{heart}</span>
          <span>{review.reactions}</span>
        </button>
      </div>
    </article>
  );
}

export default function RestaurantScreen({ id }: { id: string }) {
  const [restaurant, setRestaurant] = useState<ApiRestaurant | null>(null);
  const [failed, setFailed] = useState(false);
  const [reacted, setReacted] = useState<Set<number>>(new Set());

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

  // ♡ tap → one FACT row via the API → the backend replies with the FRESH count.
  // We print the returned count; we never count anything here.
  async function react(reviewId: number) {
    if (reacted.has(reviewId)) return;
    const res = await fetch('/api/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewId }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { reactions: number };
    setReacted((prev) => new Set(prev).add(reviewId));
    setRestaurant((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        latestReview:
          prev.latestReview && prev.latestReview.id === reviewId
            ? { ...prev.latestReview, reactions: data.reactions }
            : prev.latestReview,
        reviews: prev.reviews.map((r) =>
          r.id === reviewId ? { ...r, reactions: data.reactions } : r
        ),
      };
    });
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
    <main className="min-h-screen bg-background px-6 py-12 text-cream">
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

            {/* ---------- Latest review, highlighted ---------- */}
            {latestReview && (
              <section className="mt-10">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-cream-muted">Latest review</h2>
                <div className="mt-4">
                  <ReviewCard review={latestReview} highlighted reacted={reacted.has(latestReview.id)} onReact={react} />
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
                      reacted={reacted.has(review.id)}
                      onReact={react}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ---------- CTA ---------- */}
            <section className="mt-12 border-t border-line pt-8">
              <Link
                href={`/review/${id}`}
                className="inline-block rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-[#1a1408] transition-colors hover:bg-ember-dim"
              >
                Write a review
              </Link>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
