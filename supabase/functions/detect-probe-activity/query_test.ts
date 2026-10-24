import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { ADMIN_FNS, URL_BUDGET_BYTES, buildQuery, buildUrl, coerceRow, parseAnalyticsTime } from './query.ts';
import { ACTIVE_CONTENT_SUFFIXES, PAYLOAD_MARKERS } from './payload.ts';

const start = new Date('2026-10-24T15:00:00Z');
const end = new Date('2026-10-24T15:30:00Z');

Deno.test('the built URL fits a GET: the 414 that took the detector down for an afternoon', () => {
  const url = buildUrl(start, end);
  assert(url.length < URL_BUDGET_BYTES, `URL is ${url.length} bytes, budget ${URL_BUDGET_BYTES}`);
});

Deno.test('every marker and suffix is in the SQL, escaped, inside one needle array per list', () => {
  const sql = buildQuery();
  for (const m of PAYLOAD_MARKERS) assertStringIncludes(sql, `'${m.replace(/'/g, "''")}'`);
  for (const s of ACTIVE_CONTENT_SUFFIXES) assertStringIncludes(sql, `'${s}'`);
  // Two multiSearchAny calls: the payload list and the storage suffix list.
  // One call per list is what keeps the URL under budget.
  assertEquals(sql.split('multiSearchAny(').length - 1, 2);
  for (const fn of ADMIN_FNS) assertStringIncludes(sql, `'${fn}'`);
});

Deno.test('nothing the endpoint rejects: no wildcard, no WITH, no match(), status compared as strings', () => {
  const sql = buildQuery();
  assert(!/select\s+\*/i.test(sql));
  assert(!/^\s*with\b/i.test(sql));
  assert(!/\bmatch\(/.test(sql));
  assert(!/multiMatchAny|toUInt16OrZero/.test(sql));
  assertStringIncludes(sql, "= '404'");
  assertStringIncludes(sql, "source = 'edge_logs'");
  assertStringIncludes(sql, "!= 'OPTIONS'");
});

Deno.test('both timestamp bounds travel as ISO strings', () => {
  const u = new URL(buildUrl(start, end));
  assertEquals(u.searchParams.get('iso_timestamp_start'), '2026-10-24T15:00:00.000Z');
  assertEquals(u.searchParams.get('iso_timestamp_end'), '2026-10-24T15:30:00.000Z');
});

Deno.test('analytics timestamps have no zone and are UTC', () => {
  assertEquals(parseAnalyticsTime('2026-10-23T19:08:06.032000').toISOString(), '2026-10-23T19:08:06.032Z');
  assertEquals(parseAnalyticsTime('2026-10-23T19:08:06Z').toISOString(), '2026-10-23T19:08:06.000Z');
});

Deno.test('a result row is coerced: missing keys are empty, counters are numbers', () => {
  const r = coerceRow({ ip: '1.2.3.4', total: 7, fourxx: '2', sample_paths: ['/rest/v1/x'] });
  assertEquals(r.ip, '1.2.3.4');
  assertEquals(r.ja4, '');
  assertEquals(r.total, 7);
  assertEquals(r.fourxx, 2);
  assertEquals(r.payload_hits, 0);
  assertEquals(r.sample_paths, ['/rest/v1/x']);
});
