/**
 * Tidy a lead's job hint for storage and display.
 *
 * Facebook/Meta Lead Ads phrase their service question as a marketing greeting
 * ("Hello, how can we help you to save time and money today?") and return the
 * answer in snake_case. The greeting is noise — we want the answer. This strips
 * greeting-style question labels, keeps real labels (e.g. "acreage: 6"), and
 * tidies snake_case values. Applied both at intake (so new rows are clean) and
 * at display (so existing rows read cleanly too).
 */
const GREETING = /how can we help|save time and money|please select|which service|what (do|are) you|tell us/i;

function tidy(s: string): string {
  return s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tidyJobHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lines = String(raw)
    .split('\n')
    .map((line) => {
      const m = line.match(/^([^:]+):\s*(.+)$/);
      if (!m) return tidy(line);
      const label = m[1];
      const value = tidy(m[2]);
      // Drop the label when it's just a marketing greeting — keep the answer.
      return GREETING.test(label) ? value : `${tidy(label)}: ${value}`;
    })
    .map((s) => s.trim())
    .filter(Boolean);
  const out = lines.join('\n').trim();
  if (!out) return null;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
