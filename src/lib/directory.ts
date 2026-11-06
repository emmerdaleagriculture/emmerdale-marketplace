import { revalidatePath, revalidateTag } from 'next/cache';
import { COUNTY_DIRECTORY_TAG } from '@/lib/reference';

/** The three programmatic county routes (/<vertical>/<county>). */
const COUNTY_ROUTES = ['/paddock-maintenance', '/hay-bales', '/tractor-hire'] as const;

/**
 * Who is listed in the directory, and how many contractors cover a county,
 * change when a member edits their listing or counties, when an Open
 * membership starts or lapses (Stripe's webhook and the nightly sync), and
 * when we approve, vet, suspend, delete or comp a contractor. Every one of
 * those calls this: the cached directory is dropped, /contractors is
 * rebuilt, and every county page is marked stale so its next visitor gets
 * fresh counts (the coverage loaders sit under the same tag, so the rebuild
 * reads fresh rows). The county pages otherwise keep a week-long cache, so
 * this is what moves them between deploys; a change made in SQL waits for
 * the week.
 */
export function revalidateDirectory(): void {
  revalidateTag(COUNTY_DIRECTORY_TAG);
  revalidatePath('/contractors');
  for (const route of COUNTY_ROUTES) {
    revalidatePath(route);
    revalidatePath(`${route}/[county]`, 'page');
  }
}
