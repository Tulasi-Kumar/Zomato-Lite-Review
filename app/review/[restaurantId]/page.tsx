'use client';

// Screen 1 — /review/[restaurantId]
// The order form. Three things: star picker, comment box, Submit.
// Frontend validation = kindness. Backend validation = security. Both exist.

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReviewPage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = use(params); // Next 16: params is a Promise — unwrap with use()
  const router = useRouter();

  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [rating, setRating] = useState(0); // 0 = nothing picked yet
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We fetch the restaurant just to show its name at the top —
  // so the reviewer knows exactly what they are reviewing.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/restaurants/${restaurantId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('not found'))))
      .then((data: { name: string }) => {
        if (!cancelled) setRestaurantName(data.name);
      })
      .catch(() => {
        if (!cancelled) setRestaurantName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  // KINDNESS CHECK (frontend): Submit stays disabled until BOTH are valid.
  // The backend re-checks everything anyway — this only saves honest users a trip.
  const canSubmit = rating >= 1 && comment.trim().length > 0 && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault(); // stop the browser's old-school full-page form submit
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: Number(restaurantId),
          rating,
          comment: comment.trim(),
        }),
      });

      if (res.status === 201) {
        // Success — show the restaurant page, which re-reads everything fresh.
        router.push(`/restaurant/${restaurantId}`);
        return;
      }

      // ANY failure (400, 500...): show the BACKEND'S message, verbatim.
      // We do not invent our own here — the backend's reason is the truth.
      const data = await res.json();
      setError(data.error ?? 'Something went wrong.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[560px] bg-stone-50 px-6 py-16 text-neutral-900">
      <h1 className="text-3xl font-semibold tracking-tight">
        {restaurantName ?? 'Loading…'}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">Write a review</p>

      <form onSubmit={handleSubmit} className="mt-10 space-y-10">
        {/* Star picker — the only allowed way to choose 1 to 5 */}
        <div>
          <label className="mb-3 block text-sm font-medium">Rating</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                aria-label={`${star} star${star === 1 ? '' : 's'}`}
                onClick={() => setRating(star)}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border text-lg transition-colors ${
                  star <= rating
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-neutral-200 bg-white text-neutral-300'
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* Comment box */}
        <div>
          <label htmlFor="comment" className="mb-3 block text-sm font-medium">
            Your review
          </label>
          <textarea
            id="comment"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What did you think?"
            className="w-full resize-none rounded-lg border border-neutral-200 bg-white p-3 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
          />
        </div>

        {/* Backend error, displayed VERBATIM — kind-looking, quiet */}
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {submitting ? 'Submitting…' : 'Submit review'}
        </button>
      </form>
    </main>
  );
}
