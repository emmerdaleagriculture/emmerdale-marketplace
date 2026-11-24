/**
 * Home page hero split test, phones only (22 Nov 2026).
 *
 * A: the hero as it was — kicker, headline, standfirst, promises, then the
 *    quote form, which started ~1,013px down on an iPhone 13.
 * B: a smaller headline, then the form (~412px down), then the standfirst
 *    and promises. No kicker.
 * The header, banner image and yellow ticker are identical in both.
 *
 * The arm is picked in the browser by an inline script that runs before the
 * hero is parsed, so there is no flash and the page stays statically cached.
 * It lands on <html data-home-ab>, CSS does the rearranging
 * (home.module.css, "split test"), and PageTracker sends it with the visit.
 * Read the result on Admin › Insight › A/B tests (admin_home_split_summary).
 *
 * To stop the test: set HOME_SPLIT_ENABLED to false. Everyone sees A, and
 * nothing more is recorded with an arm. To ship B, move its CSS into the
 * base rules and delete this file.
 */
export const HOME_SPLIT_ENABLED = true;

const KEY = 'ea_home_ab';
/** The site's phone breakpoint (home.module.css uses the same 767px). */
const PHONE = '(max-width: 767px)';

/**
 * Phones only, never the app (contractors, not customers), and never a
 * signed-in visitor: the test is about people arriving to get a price, and
 * one member opening the site all day swamped an arm. A browser seen signed
 * in is marked 'x' and stays out for good, signed in or not; it sees A.
 * Kept per browser so a returning visitor sees the same page; with no
 * storage, a fresh pick per load is still a fair coin.
 */
export const HOME_SPLIT_SCRIPT = `(function(){try{var h=document.documentElement;if(h.hasAttribute('data-app')||!window.matchMedia||!matchMedia('${PHONE}').matches)return;var v=null;try{v=localStorage.getItem('${KEY}')}catch(e){}if(/(?:^|;\\s*)sb-[^=]*-auth-token(?:\\.\\d+)?=/.test(document.cookie)){try{localStorage.setItem('${KEY}','x')}catch(e){}return}if(v==='x')return;if(v!=='a'&&v!=='b'){v=Math.random()<0.5?'a':'b';try{localStorage.setItem('${KEY}',v)}catch(e){}}h.setAttribute('data-home-ab',v)}catch(e){}})();`;

/** The arm this page view is in, or null when not in the test. */
export function homeVariant(): 'a' | 'b' | null {
  if (typeof document === 'undefined') return null;
  const v = document.documentElement.getAttribute('data-home-ab');
  return v === 'a' || v === 'b' ? v : null;
}
