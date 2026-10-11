import { notFound } from 'next/navigation';

/**
 * Catch-all for addresses that match no route. Next only renders a group's
 * not-found.tsx for notFound() thrown inside that group; an unmatched URL
 * otherwise falls through to the framework's bare default page, because
 * there is no root layout above the groups to hang a root not-found on.
 * Throwing from here hands every unknown address to (frontend)/not-found.tsx,
 * with the site around it. The response is still a 404.
 */
export default function CatchAll() {
  notFound();
}
