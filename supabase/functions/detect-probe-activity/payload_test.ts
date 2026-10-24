import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { ACTIVE_CONTENT_SUFFIXES, PAYLOAD_MARKERS, hasPayloadMarker } from './payload.ts';

Deno.test('every marker is lowercase and non-empty, so the lower() in SQL matches it', () => {
  for (const m of PAYLOAD_MARKERS) {
    assert(m.length > 0);
    assertEquals(m, m.toLowerCase(), `not lowercase: ${m}`);
  }
  for (const s of ACTIVE_CONTENT_SUFFIXES) assertEquals(s, s.toLowerCase());
});

Deno.test('no bare apostrophe and no bare "or": a member typing "doesn\'t" is not an attack', () => {
  assertFalse(PAYLOAD_MARKERS.includes("'"));
  assertFalse(PAYLOAD_MARKERS.includes('%27'));
  assertFalse(PAYLOAD_MARKERS.includes('or'));
  assertFalse(PAYLOAD_MARKERS.includes(' or '));
  // Real searches people have typed, URL-encoded as PostgREST sends them.
  for (const real of [
    '/rest/v1/services?select=name&name=ilike.*doesn%27t*',
    "/rest/v1/counties?name=eq.King's Lynn",
    '/rest/v1/job_submissions?select=*&notes=ilike.*or%20more*',
    '/rest/v1/rpc/sq_quote_position?p_token=abc',
    "/rest/v1/contractors?business_name=ilike.*O'Brien*",
    '/rest/v1/notes?slug=eq.hedge-cutting-cost&select=title,body',
  ]) {
    assertFalse(hasPayloadMarker(real), `false positive: ${real}`);
  }
});

Deno.test('the obvious scanner payloads are caught in each encoding', () => {
  for (const bad of [
    "/rest/v1/jobs?id=eq.1' or 1=1--",
    '/rest/v1/jobs?id=eq.1%27%20or%201=1--',
    "/rest/v1/jobs?id=eq.1'+or+'1'='1",
    '/rest/v1/jobs?select=*&id=eq.1 union select null--',
    '/rest/v1/jobs?select=*&id=eq.1+union+select+null',
    '/functions/v1/../../etc/passwd',
    '/storage/v1/object/public/..%2f..%2fetc%2fpasswd',
    '/rest/v1/jobs?name=<script>alert(1)</script>',
    '/rest/v1/jobs?name=%3Cscript%3Ealert(1)%3C/script%3E',
    '/rest/v1/jobs?id=eq.1;select pg_sleep(5)--',
    '/rest/v1/information_schema.tables',
  ]) {
    assert(hasPayloadMarker(bad), `missed: ${bad}`);
  }
});

Deno.test('one multiSearchAny needle array stays under the ClickHouse limit', () => {
  assert(PAYLOAD_MARKERS.length <= 255);
  assert(ACTIVE_CONTENT_SUFFIXES.length <= 255);
});
