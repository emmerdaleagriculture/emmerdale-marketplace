/**
 * Where the company is on social media. One list, read by every header bar
 * (and anything else that wants it), so a handle change is a one-line edit.
 *
 * Tom, 2026-09-06: Instagram is Hampshire Paddock Management's account,
 * TikTok is Emmerdale Agriculture's — both are the same business, and both
 * belong in the header.
 */
export const SOCIAL_LINKS = [
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/hampshirepaddockmanagement',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    href: 'https://www.tiktok.com/@emmerdale.agricul',
  },
] as const;

export type SocialId = (typeof SOCIAL_LINKS)[number]['id'];
