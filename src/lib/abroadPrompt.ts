/**
 * The outside-the-UK prompt (components/abroad/AbroadPrompt) and what it
 * writes. Shared between the component, its beacon route and the admin
 * countries page so the label and the page list are said once.
 */

/** page_events.label prefix: abroad_prompt:shown | dismissed | customer | contractor. */
export const PROMPT_LABEL_PREFIX = 'abroad_prompt:';

export type PromptEvent = 'shown' | 'dismissed' | 'customer' | 'contractor';

/** The source_path marker a registration carries when the prompt sent them. */
export const PROMPT_SOURCE_SUFFIX = '#prompt';

/**
 * Where the prompt may appear: the pages a visitor from abroad lands on from
 * a search or an ad. Never the job funnel, the forms, or anything signed in.
 * '/' is exact; the rest are prefixes.
 */
export const PROMPT_PATHS = [
  '/',
  '/notes',
  '/paddock-care',
  '/agriculturalcontractors',
  '/contractors',
  '/services',
  '/paddock-maintenance',
  '/hay-bales',
  '/tractor-hire',
];

export function promptAllowedOn(pathname: string): boolean {
  if (pathname === '/') return true;
  return PROMPT_PATHS.some((p) => p !== '/' && (pathname === p || pathname.startsWith(`${p}/`)));
}

/** localStorage key for "seen it, leave me alone" and how long that lasts. */
export const PROMPT_DISMISSED_KEY = 'ea:abroad-prompt';
export const PROMPT_DISMISSED_DAYS = 30;
