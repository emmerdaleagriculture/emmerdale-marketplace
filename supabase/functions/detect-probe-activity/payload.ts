// Injection, traversal and XSS markers, as literal lowercase substrings.
//
// Each marker is listed in every encoding that reaches the API gateway: raw,
// `+` for a space, `%20`, `%27` for an apostrophe. The gateway log keeps the
// request URL exactly as the client sent it, so a scanner that URL-encodes its
// payload and one that does not are two different strings here.
//
// Two rules keep real people out of this list, both learned the hard way on
// the site this was ported from:
//   - never a bare apostrophe or a bare `or`: a member typing "doesn't" into a
//     search box sends `doesn%27t` 27 times through autocomplete, and that is
//     not an attack;
//   - markers are counted as DISTINCT strings per actor (query.ts), so one
//     phrase repeated is one hit, and the scorer caps the signal.
//
// Kept in one place so the ClickHouse query (which folds the list into one
// multiSearchAny per request) and the JS mirror hasPayloadMarker() can never
// disagree, and so a test can hold a real member search against the list.

export const PAYLOAD_MARKERS: readonly string[] = [
  // Path traversal and the files it goes looking for.
  '/etc/',
  'passwd',
  '../',
  '..%2f',
  '..%5c',
  // SQL discovery and timing.
  'information_schema',
  'pg_sleep',
  'sleep(',
  'benchmark(',
  'waitfor delay',
  'union select',
  'union+select',
  'union%20select',
  'union all select',
  'union+all+select',
  'union%20all%20select',
  // XSS.
  '<script',
  '%3cscript',
  'javascript:',
  'onerror=',
  // An apostrophe followed by SQL grammar, raw and encoded. The apostrophe on
  // its own is deliberately not here.
  "' or ",
  "'+or+",
  "'%20or%20",
  "%27 or ",
  '%27+or+',
  '%27%20or%20',
  "' and ",
  "'+and+",
  "'%20and%20",
  '%27+and+',
  '%27%20and%20',
  "'--",
  '%27--',
  "';",
  '%27;',
  // Boolean tautologies.
  ' or 1=',
  '+or+1=',
  '%20or%201=',
  ' or 1--',
  " or '",
  '+or+%27',
];

/**
 * The JS mirror of the SQL test: does this path+search string carry a marker?
 * Exists so the list can be checked against real request shapes in a unit
 * test, without a network.
 */
export function hasPayloadMarker(pathAndSearch: string): boolean {
  const s = pathAndSearch.toLowerCase();
  return PAYLOAD_MARKERS.some((m) => s.includes(m));
}

/** Uploads to storage whose extension would run as code or script if served. */
export const ACTIVE_CONTENT_SUFFIXES: readonly string[] = [
  '.php',
  '.phtml',
  '.pht',
  '.html',
  '.htm',
  '.js',
  '.svg',
];
