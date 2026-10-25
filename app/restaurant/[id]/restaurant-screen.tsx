'use client';

// app/restaurant/[id]/restaurant-screen.tsx — THE DINING AREA (the actual screen).
// It fetches the API response and RENDERS it.
// Frontend promise: zero maths. averageRating arrives as 4.5, we print 4.5.
// No AVG. No rounding. No sorting. Any maths found in this file is a bug.

import { useEffect, useState } from 'react';
import Link from 'next/link';

// The shape of the API response — copied from the contract, not from maths.
type ApiReview = {
  id: number;
  rating: number;
  comment: string;
  createdAt: string;
};

type ApiRestaurant = {
  name: string;
  cuisine: string;
  area: string;
  averageRating: number | null; // null = no reviews yet. We did NOT invent a 0 for this.
  totalReviews: number;
  latestReview: ApiReview | null;
  reviews: ApiReview[];
};

export default function RestaurantScreen({ id }: { id: string }) {
  const [restaurant, setRestaurant] = useState<ApiRestaurant | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false; // guard: if the user navigates away mid-fetch, ignore the late result

    fetch(`/api/restaurants/${id}`)
      .then((res) => {
        if (res.status === 404) throw new Error('not found');
        return res.json();
      })
      .then((data: ApiRestaurant) => {
        if (!cancelled) setRestaurant(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFound) {
    return (
      <main className="mx-auto min-h-screen max-w-[560px] bg-stone-50 px-6 py-24 text-neutral-900">
        <p className="text-lg font-medium">Restaurant not found.</p>
        <p className="mt-2 text-sm text-neutral-500">
          There is no restaurant with the id “{id}”.
        </p>
      </main>
    );
  }

  if (!restaurant) {
    return (
      <main className="mx-auto min-h-screen max-w-[560px] bg-stone-50 px-6 py-24 text-neutral-500">
        Loading…
      </main>
    );
  }

  const { name, cuisine, area, averageRating, totalReviews, latestReview, reviews } = restaurant;

  return (
    <main className="mx-auto min-h-screen max-w-[560px] bg-stone-50 px-6 py-16 text-neutral-900">
      {/* 1. Name first */}
      <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {cuisine} · {area}
      </p>

      {/* 2. The average — the first thing the eye lands on.
          THE LINE WHERE WE PRINT THE AVERAGE: {averageRating} is printed as-is.
          It is 4.5 because the BACKEND handed us 4.5. This file adds nothing. */}
      {averageRating === null ? (
        /* Empty state: no reviews yet — the page invites the first one */
        <section className="mt-12">
          <p className="text-5xl font-light text-neutral-300">—</p>
          <p className="mt-3 text-neutral-600">No reviews yet.</p>
          <p className="mt-1 text-neutral-600">
            Be the first to review {name}.
          </p>
          <Link
            href={`/review/${id}`}
            className="mt-8 inline-block rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white"
          >
            Write the first review
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-10">
            <div className="flex items-baseline gap-3">
              {/* backend-computed average, printed verbatim */}
              <span className="text-6xl font-bold tracking-tight">{averageRating}</span>
              <span className="text-sm text-neutral-500">
                {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
              </span>
            </div>
          </section>

          {/* 3. Latest review — highlighted, because recency is what people trust.
              It comes as a SEPARATE field from the API, so there is nothing to pick out here. */}
          {latestReview && (
            <section className="mt-12">
              <blockquote className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <p className="mb-2 flex gap-1 text-sm font-semibold text-amber-700">
                  <span aria-hidden>{'★'.repeat(latestReview.rating)}</span>
                  <span className="sr-only">{latestReview.rating} out of 5 stars</span>
                </p>
                <p className="text-neutral-800">{latestReview.comment}</p>
                <p className="mt-3 text-xs text-neutral-500">
                  Posted today · latest review
                </p>
              </blockquote>
            </section>
          )}

          {/* 4. Older reviews — a plain list, newest first because the API already sorted them */}
          {reviews.length > 0 && (
            <section className="mt-12">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Older reviews
              </h2>
              <ul className="mt-4 divide-y divide-neutral-200">
                {reviews.map((review) => (
                  <li key={review.id} className="py-4">
                    <p className="text-sm text-amber-700">
                      <span aria-hidden>{'★'.repeat(review.rating)}</span>
                      <span className="sr-only">{review.rating} out of 5 stars</span>
                    </p>
                    <p className="mt-1 text-neutral-800">{review.comment}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 5. Link to the review form */}
          <section className="mt-14 border-t border-neutral-200 pt-8">
            <Link
              href={`/review/${id}`}
              className="inline-block rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white"
            >
              Write a review
            </Link>
          </section>
        </>
      )}
    </main>
  );
}
