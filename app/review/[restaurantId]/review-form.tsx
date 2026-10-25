'use client';

// app/review/[restaurantId]/review-form.tsx — THE ORDER FORM, Ember Edition.
// Name (optional), stars, comment, and the honest question: what did you eat?
// Frontend validation = kindness (disabled button, maxLength).
// Backend validation = security (30-char check, item existence). Both live.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/theme-toggle';

type ApiMenu = { id: number; name: string; kind: string };

export default function ReviewForm({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();

  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [menu, setMenu] = useState<ApiMenu[]>([]);
  const [rating, setRating] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [comment, setComment] = useState('');
  const [itemIds, setItemIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The form gets the restaurant name AND the menu from the same endpoint
  // that powers the restaurant page — items shown as chips are only
  // REAL menu items; fake submissions get rejected by the backend anyway.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/restaurants/${restaurantId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('not found'))))
      .then((data: { name: string; menu: ApiMenu[] }) => {
        if (cancelled) return;
        setRestaurantName(data.name);
        setMenu(data.menu);
      })
      .catch(() => {
        if (!cancelled) setRestaurantName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const canSubmit =
    rating >= 1 && comment.trim().length > 0 && displayName.length <= 30 && !submitting;

  function toggleItem(itemId: number) {
    setItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
          ...(displayName.trim().length > 0 ? { displayName: displayName.trim() } : {}),
          ...(itemIds.size > 0 ? { items: [...itemIds] } : {}),
        }),
      });

      if (res.status === 201) {
        // Celebration, then page change — the restaurant page re-reads everything fresh.
        setCelebrating(true);
        setTimeout(() => {
          router.push(`/restaurant/${restaurantId}`);
        }, 1300);
        return;
      }

      // Show the BACKEND'S message verbatim — it is the source of truth.
      const data = await res.json();
      setError(data.error ?? 'Something went wrong.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const vegItems = menu.filter((item) => item.kind === 'veg');
  const nonVegItems = menu.filter((item) => item.kind === 'non_veg');

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-cream">
      <div className="mx-auto max-w-[560px]">
        <ThemeToggle />

        {/* Celebration overlay — pure presentational toast, then redirect */}
        {celebrating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90">
            <div className="rounded-2xl border border-ember/40 bg-surface px-10 py-8 text-center">
              <p className="text-3xl tracking-widest text-ember">★ ★ ★</p>
              <p className="mt-4 text-lg font-medium">Thanks! Your review is live.</p>
              <p className="mt-1 text-sm text-cream-muted">Taking you to the restaurant page…</p>
            </div>
          </div>
        )}

        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-ember">New review</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            {restaurantName ?? 'Loading…'}
          </h1>
          <p className="mt-1 text-sm text-cream-muted">Your review publishes instantly — no account needed.</p>
        </header>

        <form onSubmit={handleSubmit} className="mt-10 space-y-9">

          {/* Name — optional */}
          <div>
            <label htmlFor="displayName" className="mb-3 block text-sm font-medium">
              Your name <span className="font-normal text-cream-muted">(optional — shows on your review)</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              maxLength={30} /* kindness; the backend re-checks for real */
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-cream-muted/50 focus:border-ember/50 focus:outline-none"
            />
          </div>

          {/* Stars */}
          <div>
            <label className="mb-3 block text-sm font-medium">Rating</label>
            <div className="flex gap-2.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} star${star === 1 ? '' : 's'}`}
                  onClick={() => setRating(star)}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 text-2xl transition-colors ${
                    star <= rating
                      ? 'border-ember bg-ember/25 text-ember font-bold'
                      : 'border-line bg-surface text-cream-muted hover:border-ember/50 hover:text-ember/60'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* What did you eat? — chips built ONLY from the real menu */}
          {menu.length > 0 && (
            <div>
              <label className="mb-3 block text-sm font-medium">
                What did you eat? <span className="font-normal text-cream-muted">(optional)</span>
              </label>
              <ChipGroup label="Vegetarian" items={vegItems} selected={itemIds} onToggle={toggleItem} color="veggie" />
              <div className="mt-3">
                <ChipGroup label="Non-vegetarian" items={nonVegItems} selected={itemIds} onToggle={toggleItem} color="meat" />
              </div>
            </div>
          )}

          {/* Comment */}
          <div>
            <label htmlFor="comment" className="mb-3 block text-sm font-medium">
              Your review
            </label>
            <textarea
              id="comment"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you think? Which burrito deserves a fan club?"
              className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-cream placeholder:text-cream-muted/50 focus:border-ember/50 focus:outline-none"
            />
          </div>

          {/* Backend error, shown VERBATIM */}
          {error && (
            <p className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl border-2 px-6 py-3.5 text-sm font-semibold transition-colors bg-ember border-ember text-[#1a1408] hover:bg-ember-dim disabled:cursor-not-allowed disabled:bg-surface disabled:border-line disabled:text-cream-muted"
          >
            {submitting ? 'Submitting…' : 'Submit review'}
          </button>
          {!canSubmit && !submitting && (
            <p className="text-center text-xs text-cream-muted">
              Pick a star and write a comment to unlock the button.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

function ChipGroup({
  label,
  items,
  selected,
  onToggle,
  color,
}: {
  label: string;
  items: ApiMenu[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  color: 'veggie' | 'meat';
}) {
  if (items.length === 0) return null;
  const active = color === 'veggie' ? 'border-veggie bg-veggie/15 text-veggie' : 'border-meat bg-meat/15 text-meat';
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-cream-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              aria-pressed={isSelected}
              className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                isSelected
                  ? active
                  : 'border-line bg-surface text-cream-muted hover:border-cream-muted/40 hover:text-cream'
              }`}
            >
              {isSelected ? '✓ ' : ''}{item.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
