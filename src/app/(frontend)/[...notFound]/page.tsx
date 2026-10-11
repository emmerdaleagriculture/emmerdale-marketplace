import { notFound } from 'next/navigation';

/**
 * Catch-all for addresses that match no route. Next only renders a group's
 * not-found.tsx for notFound() thrown inside that group; an unmatched URL
 * otherwise falls through to the framework's bare default page, because
 * there is no root layout above the groups to hang a root not-found on.
 * Throwing from here hands every unknown address to (frontend)/not-found.tsx,
 * with the site around it. The response is still a 404.
 *
 * Side effect: the no-html-link-for-pages lint rule builds its URL regex from
 * every app route, and a catch-all matches every path, so from here on any
 * internal <a href> fails lint. Use <Link> for internal links (or disable
 * the rule on the line where a full load is intended, as global-error does).
 */
export default function CatchAll() {
  notFound();
}
