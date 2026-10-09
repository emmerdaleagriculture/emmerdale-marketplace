/**
 * The customer-enquiry verticals (hay, tractor hire): the one place that says
 * which canonical service each one becomes. The form asks that service's
 * questions (CONDITION_QUESTIONS), the server validates the answers against
 * the same set, and an operator publishing the lead by hand keeps them only
 * for that service — three readers, so the mapping lives once. Zod-free so
 * the client form can import it.
 */
export type EnquiryCategory = 'hay' | 'tractor-hire';

export const ENQUIRY_CATEGORIES: Record<
  EnquiryCategory,
  { serviceId: number; serviceName: string; label: string; title: string }
> = {
  hay: {
    serviceId: 16,
    serviceName: 'Hay, straw & haylage',
    label: 'hay & straw',
    title: 'Hay, straw or haylage wanted',
  },
  'tractor-hire': {
    serviceId: 17,
    serviceName: 'Tractor hire (events)',
    label: 'tractor hire',
    title: 'Tractor hire for an event',
  },
};

export function isEnquiryCategory(c: unknown): c is EnquiryCategory {
  return typeof c === 'string' && c in ENQUIRY_CATEGORIES;
}
