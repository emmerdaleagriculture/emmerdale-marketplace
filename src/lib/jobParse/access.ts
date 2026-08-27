/**
 * Gate / access details asked on the confirm step. Access problems are the
 * variation cause a drawn boundary cannot touch (spec §26a) — a contractor's
 * first question is "does the machine fit through the gate", and a what3words
 * square finds the gate itself down a mile of unnamed track.
 *
 * Width is tap-to-answer, never free text (§26a.2 rule: comparable across
 * jobs). Bands are what a contractor reasons in — a "standard" field gate is
 * nominally 12ft.
 */

export const GATE_WIDTH_OPTIONS = [
  { value: 'standard', label: 'Normal field gate (about 12ft)' },
  { value: 'wide', label: 'Wider than that' },
  { value: 'narrow', label: 'Narrower — tight access' },
  { value: 'none', label: 'No gate — open access' },
  { value: 'unsure', label: 'Not sure' },
] as const;

export type GateWidth = (typeof GATE_WIDTH_OPTIONS)[number]['value'];

export const GATE_WIDTH_VALUES = GATE_WIDTH_OPTIONS.map((o) => o.value);

const GATE_WIDTH_LABELS: Record<string, string> = Object.fromEntries(
  GATE_WIDTH_OPTIONS.map((o) => [o.value, o.label]),
);

export function gateWidthLabel(value: string | null): string | null {
  return value ? (GATE_WIDTH_LABELS[value] ?? null) : null;
}

// Three dot-separated words. what3words uses lowercase letters (no digits or
// hyphens in English addresses); leading slashes and whitespace are noise.
const W3W_RE = /^([a-z]+)\.([a-z]+)\.([a-z]+)$/;

/**
 * Normalise a what3words address to bare `word.word.word` lowercase, or null
 * when the input isn't one. Format validation only — no what3words API call;
 * a typo'd square is still a lead, and Part 2 can resolve it when rendering
 * the invitation.
 */
export function normaliseW3w(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(/^\/+/, '').replace(/\s+/g, '');
  if (cleaned.length === 0 || cleaned.length > 60) return null;
  return W3W_RE.test(cleaned) ? cleaned : null;
}
