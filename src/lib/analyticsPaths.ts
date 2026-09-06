/**
 * Which pages the analytics tags must stay off, and how to write down a path
 * that has a secret in it.
 *
 * A job token is not an identifier, it is a key: the client token opens a
 * customer's job — contact details, prices, the payment link — and the
 * invitation token opens a contractor's quote page. Sending those addresses
 * to Google and Facebook as the page URL was sending them the key, to sit in
 * two analytics accounts and be readable by anyone with access to either.
 *
 * Plain module rather than part of the component so the rules can be tested:
 * getting one of these regexes slightly wrong is a silent leak.
 */

/** Token-addressed routes, plus the admin panel, which is nobody's funnel. */
const SENSITIVE = [/^\/my(\/|$)/, /^\/quote(\/|$)/, /^\/admin(\/|$)/];

export function isSensitivePath(path: string): boolean {
  return SENSITIVE.some((re) => re.test(path));
}

/** A 48-hex token is a secret wherever in the path it appears. */
export function redactPath(path: string): string {
  return path.replace(/[0-9a-f]{48}/gi, '[token]');
}
