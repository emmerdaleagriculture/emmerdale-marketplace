/**
 * Domain typo detection for an address the customer types once and never sees
 * again.
 *
 * `tom@lumenira.con` is valid by every syntax rule there is — it parses, it
 * ends in something TLD-shaped, `z.string().email()` accepts it — and it
 * silently swallowed a whole job: the portal link and the first-quote alert
 * both went nowhere, and both showed green in the queue. Syntax was never the
 * check that mattered.
 *
 * Nothing here decides whether to accept an address. Blocking belongs to the
 * DNS check in ./deliverable, which knows whether a domain exists instead of
 * guessing whether it looks right. This module only turns a rejection into a
 * sentence worth reading — "did you mean gmail.com?" rather than "invalid".
 */

/** Mailbox providers a UK customer actually uses, so a near-miss is a typo. */
const KNOWN_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'outlook.co.uk',
  'live.com', 'live.co.uk',
  'yahoo.com', 'yahoo.co.uk',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'msn.com',
  'btinternet.com', 'sky.com', 'talktalk.net', 'virginmedia.com',
  'ntlworld.com', 'blueyonder.co.uk', 'tiscali.co.uk',
  'protonmail.com', 'proton.me',
];

/** Endings common enough that a one-character miss is almost certainly a slip. */
const COMMON_TLDS = [
  'com', 'co.uk', 'org.uk', 'me.uk', 'net', 'org', 'uk', 'info', 'biz',
  'ac.uk', 'gov.uk', 'sch.uk', 'ltd.uk', 'plc.uk',
  'eu', 'ie', 'io', 'me', 'co', 'com.au', 'ca', 'nz', 'us',
  'farm', 'agency', 'online', 'shop', 'app', 'dev', 'tech', 'live',
  'email', 'group', 'company', 'services', 'solutions', 'works', 'scot', 'wales',
];

/**
 * Damerau-Levenshtein (optimal string alignment) over two short strings.
 *
 * Plain Levenshtein scores a transposition as two edits, which is wrong for
 * this job: gmial/gmail and cmo/com are the two most common ways to mistype
 * an address, and at a cost of 2 they sit outside any budget tight enough to
 * be safe. Counting a swap as one edit is what makes those catchable.
 */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return a.length || b.length;
  let twoBack: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], twoBack[j - 2] + 1);
      }
    }
    twoBack = prev;
    prev = row;
  }
  return prev[b.length];
}

function splitAddress(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1).trim().toLowerCase() };
}

/**
 * A near-miss of a provider everyone knows — gmial.com, hotmial.co.uk,
 * outlok.com. Confident enough to offer unprompted while the customer is
 * still looking at the field, because none of these domains exist.
 */
export function suggestKnownProviderTypo(email: string): string | null {
  const parts = splitAddress(email.trim());
  if (!parts) return null;
  const { local, domain } = parts;
  if (KNOWN_DOMAINS.includes(domain)) return null;

  for (const known of KNOWN_DOMAINS) {
    // One edit for short domains, two for longer ones — "btinternet.com" can
    // absorb two slips without becoming a different real domain.
    const budget = known.length >= 12 ? 2 : 1;
    if (distance(domain, known) <= budget) return `${local}@${known}`;
  }
  return null;
}

/**
 * The domain looks deliberate but the ending doesn't: .con, .cmo, .couk.
 * Lower confidence than the provider check — the long tail of real TLDs is
 * unbounded — so this is only used to phrase an error we have already decided
 * to show, never to raise one.
 */
function suggestTldTypo(email: string): string | null {
  const parts = splitAddress(email.trim());
  if (!parts) return null;
  const { domain } = parts;
  const dot = domain.indexOf('.');
  if (dot < 0) return null;

  // Match the longest known ending first so "co.uk" wins over "uk".
  const ending = domain.slice(dot + 1);
  if (COMMON_TLDS.includes(ending)) return null;

  let best: { tld: string; d: number } | null = null;
  for (const tld of COMMON_TLDS) {
    const d = distance(ending, tld);
    if (d <= 1 && (!best || d < best.d)) best = { tld, d };
  }
  return best ? `${email.trim().slice(0, email.trim().length - ending.length)}${best.tld}` : null;
}

/** The best correction we can offer for an address we already know is bad. */
export function suggestEmailFix(email: string): string | null {
  return suggestKnownProviderTypo(email) ?? suggestTldTypo(email);
}
