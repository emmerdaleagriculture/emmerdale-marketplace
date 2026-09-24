import { HOME_SERVICES, type HomeService } from '@/lib/home/services';
import type { ServiceContent } from './types';
import { PART_A } from './content/a';
import { PART_B } from './content/b';
import { PART_C } from './content/c';

export type { ServiceContent } from './types';

/** Every /services/[path] page, in the home page's card order. */
export const SERVICE_PAGES: ServiceContent[] = [...PART_A, ...PART_B, ...PART_C].sort(
  (x, y) =>
    HOME_SERVICES.findIndex((c) => c.slug === x.card) -
    HOME_SERVICES.findIndex((c) => c.slug === y.card),
);

export function servicePageByPath(path: string): ServiceContent | null {
  return SERVICE_PAGES.find((p) => p.path === path) ?? null;
}

/** The card a page belongs to — its name and blurb are the page's short form. */
export function cardFor(page: ServiceContent): HomeService {
  const card = HOME_SERVICES.find((c) => c.slug === page.card);
  if (!card) throw new Error(`service page ${page.path} names unknown card ${page.card}`);
  return card;
}

/**
 * Where a card's "about this job" link goes: its service page, or the
 * dedicated vertical for the one card that already has one (tractor hire).
 */
export function servicePagePath(cardSlug: string): string | null {
  if (cardSlug === 'tractor-hire') return '/tractor-hire';
  const page = SERVICE_PAGES.find((p) => p.card === cardSlug);
  return page ? `/services/${page.path}` : null;
}
