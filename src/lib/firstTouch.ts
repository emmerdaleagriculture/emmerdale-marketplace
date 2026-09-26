/**
 * Where this visitor first arrived, kept for the length of the tab.
 *
 * The homepage and the service pages hand people to /start with `src=home`
 * (or `service`, `paddock`), and /start used that as the source whenever the
 * URL carried no utm tags — which it never does after an internal hop. So a
 * Facebook ad click that landed on the homepage and then pressed "Get
 * prices" was recorded as "Internal — home", and the channel that actually
 * brought them vanished. Measured 2026-09-26: 93 of 175 homepage hand-offs
 * had a Facebook referrer.
 *
 * Captured on the first page of the tab and read on /start. A later page
 * that arrives with its own ad tags replaces it — a fresh paid click is the
 * more specific answer. The referrer is kept only when it is another site;
 * our own pages are the hand-off, not the source.
 *
 * sessionStorage, not localStorage: a tab is a visit, and nothing here
 * should outlive it. Every access is guarded — private windows and some
 * in-app browsers throw on storage.
 */
export type FirstTouch = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  gclid?: string;
  /** Full URL of the external referrer, when there was one. */
  referrer?: string;
};

const KEY = 'ea_ft';

const clip = (v: string | null) => (v && v.trim() ? v.trim().slice(0, 300) : undefined);

export function captureFirstTouch(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const tagged = q.get('utm_source') || q.get('gclid');
    if (sessionStorage.getItem(KEY) && !tagged) return;

    let referrer: string | undefined;
    try {
      const ref = document.referrer;
      if (ref && new URL(ref).host !== window.location.host) referrer = ref.slice(0, 300);
    } catch {
      /* unparseable referrer: treat as none */
    }
    const touch: FirstTouch = {
      utm_source: clip(q.get('utm_source')),
      utm_medium: clip(q.get('utm_medium')),
      utm_campaign: clip(q.get('utm_campaign')),
      gclid: clip(q.get('gclid')),
      referrer,
    };
    sessionStorage.setItem(KEY, JSON.stringify(touch));
  } catch {
    /* storage unavailable: /start falls back to what its own URL says */
  }
}

export function readFirstTouch(): FirstTouch | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : null;
  } catch {
    return null;
  }
}
