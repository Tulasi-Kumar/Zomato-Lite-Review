// app/page.tsx — the front door.
// No more "is alive" placeholder: the root URL looks up the FIRST restaurant
// in the database and walks the visitor straight into its review page.
// Facts rule here too — the redirect target is read from the DATABASE,
// never hard-coded. No restaurants (or no database)? An honest sign instead.

import { connection } from "next/server";
import { redirect } from "next/navigation";
import { neon } from "@neondatabase/serverless";

// BLOCKING BY DESIGN: this page cannot know its destination until it has read
// the database, so it opts into blocking instead of streaming a shell
// (the docs' [block] option — allowed only in server modules like this one).
export const instant = false;

export default async function Home() {
  // The database read must happen at REQUEST time, not build time —
  // connection() tells Next.js to stop prerendering right here (the
  // documented modern way in this Next.js version, replacing force-dynamic).
  await connection();

  let restaurantId: number | null = null;
  const url = process.env.DATABASE_URL;

  if (url) {
    const db = neon(url);
    const rows = await db`SELECT id FROM restaurants ORDER BY id LIMIT 1`;
    restaurantId = rows[0]?.id ?? null;
  }

  if (restaurantId !== null) {
    redirect(`/restaurant/${restaurantId}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className="max-w-sm text-center text-lg text-neutral-800">
        Zomato Lite is open — but no restaurants have moved in yet.
      </p>
    </main>
  );
}
