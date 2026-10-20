import { revalidatePath, revalidateTag } from 'next/cache';
import { COUNTY_DIRECTORY_TAG } from '@/lib/reference';

/**
 * Who is listed in the directory changes when a member edits their
 * listing, but also when an Open membership starts or lapses (Stripe's
 * webhook and the nightly sync), when we approve, vet, suspend or comp a
 * contractor. Every one of those calls this: the cached directory is
 * dropped and /contractors rebuilt. The county pages keep their daily
 * cycle unless the caller knows which counties to rebuild.
 */
export function revalidateDirectory(): void {
  revalidateTag(COUNTY_DIRECTORY_TAG);
  revalidatePath('/contractors');
}
