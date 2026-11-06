/**
 * URL-safe slug for a county name: "East Riding of Yorkshire" →
 * "east-riding-of-yorkshire", "Hay & Straw" → "hay-and-straw". Its own
 * module, with no imports, because the client-side map needs it too and
 * verticals.ts (its old home) pulls in the server-only reference loaders.
 */
export function countySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
