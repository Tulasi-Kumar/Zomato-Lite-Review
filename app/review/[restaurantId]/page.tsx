// app/review/[restaurantId]/page.tsx — the SERVER-side door frame.
// Declares request-time rendering, awaits the URL param, mounts the form.

import ReviewForm from './review-form';

export const instant = false; // the form reads live data at request time

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  return <ReviewForm restaurantId={restaurantId} />;
}
