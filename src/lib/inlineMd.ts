/** `[anchor](/path)` (site-relative only) or `**bold**`. See components/InlineMd. */
export const INLINE_MD_TOKEN = /\[([^\]]+)\]\((\/[^)\s]*)\)|\*\*([^*]+)\*\*/g;

/** Plain text of an InlineMd string, for meta tags and structured data. */
export function stripInlineMd(text: string): string {
  return text.replace(INLINE_MD_TOKEN, (_all, anchor?: string, _path?: string, bold?: string) => anchor ?? bold ?? '');
}
