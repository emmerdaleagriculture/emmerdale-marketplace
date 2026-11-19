import { redirect } from 'next/navigation';

/**
 * Card payments moved into Books settings (2026-11-19). Stripe's return and
 * refresh links, and any old bookmarks, land here and go on to the section.
 */
export default async function StripePage({ searchParams }: { searchParams: Promise<{ return?: string; refresh?: string }> }) {
  const sp = await searchParams;
  redirect(`/account/books/settings${sp.return || sp.refresh ? '?stripe=1' : ''}#card-payments`);
}
