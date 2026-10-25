// app/restaurant/[id]/page.tsx — the SERVER-side door frame.
// Its only jobs: declare this route render at request time (never build time),
// await the URL param, and mount the interactive screen below it.

import RestaurantScreen from './restaurant-screen';

export const instant = false; // live ratings — request-time rendering by design

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RestaurantScreen id={id} />;
}
