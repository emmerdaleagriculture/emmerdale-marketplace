import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import type { ActorRow } from './query.ts';
import { clusterKey, ipInCidr, scoreActor, scoreActors } from './scorer.ts';

function actor(over: Partial<ActorRow>): ActorRow {
  return {
    ip: '203.0.113.10',
    ja4: 't13d1516h2_8daaf6152771_02713d6af862',
    ua: 'curl/8.5.0',
    asn_org: 'Hostinger International Limited',
    country: 'ES',
    total: 6,
    fourxx: 6,
    fn404_distinct: 0,
    rest_enum: 0,
    rpc404_distinct: 0,
    admin_denied: 0,
    payload_hits: 0,
    storage_active: 0,
    write2xx: 0,
    distinct_paths: 6,
    sample_paths: ['/functions/v1/admin', '/functions/v1/debug'],
    first_seen: '2026-10-17T23:07:00.000000',
    last_seen: '2026-10-18T00:44:00.000000',
    ...over,
  };
}

/**
 * The shape of the real 2026-10-17 scan: ~350 requests from ~70 IPs in one
 * hosting /18, 5 to 9 each, every one under any per-IP threshold.
 */
function spray(): ActorRow[] {
  const rows: ActorRow[] = [];
  for (let i = 0; i < 70; i++) {
    rows.push(
      actor({
        ip: `185.196.${8 + (i >> 6)}.${(i * 3) % 250 + 1}`,
        asn_org: ['Hostinger International Limited', 'A100 ROW GmbH', 'Atlas Networks'][i % 3],
        country: ['ES', 'DE', 'NL'][i % 3],
        total: 5,
        fourxx: 5,
        fn404_distinct: i % 2 ? 2 : 1,
        rest_enum: i % 3 === 0 ? 1 : 0,
      }),
    );
  }
  return rows;
}

Deno.test('the real spray is one critical cluster, not seventy nothings', () => {
  const clusters = scoreActors(spray());
  assertEquals(clusters.length, 1);
  const c = clusters[0];
  assertEquals(c.severity, 'critical');
  assertEquals(c.actors.length, 70);
  assertStringIncludes(c.label, '3 networks incl.');
  assertStringIncludes(c.label, 'curl/8.5.0');
  assertStringIncludes(c.message, '70 IPs');
  assertStringIncludes(c.message, 'unknown function name');
  assertStringIncludes(c.message, 'No write from this actor succeeded.');
  assertStringIncludes(c.message, `[cluster:${c.key}]`);
  assert(!c.message.startsWith('CHECK:'));
});

Deno.test('a CI run from one IP with hundreds of 4xx and a browser UA scores nothing', () => {
  const ci = actor({
    ip: '20.55.1.9',
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129 Safari/537.36',
    asn_org: 'Microsoft Corporation',
    total: 900,
    fourxx: 400,
  });
  assertEquals(scoreActors([ci]).length, 0);
  // Even off the crawler-org list, 4xx alone never scores.
  assertEquals(scoreActor({ ...ci, asn_org: 'Some Runner Ltd' }).score, 0);
});

Deno.test('our own edge functions are excluded by user agent, whatever they did', () => {
  const own = actor({
    ua: 'Deno/2.1.4 (variant; SupabaseEdgeRuntime/1.77.7; ref=wiipzjpqztqjtczeuodp)',
    asn_org: 'A100 ROW GmbH',
    fn404_distinct: 12,
    admin_denied: 9,
  });
  assertEquals(scoreActors([own]).length, 0);
});

Deno.test('the allowlist is a CIDR match', () => {
  assert(ipInCidr('10.1.2.3', '10.1.0.0/16'));
  assert(!ipInCidr('10.2.2.3', '10.1.0.0/16'));
  assert(ipInCidr('203.0.113.7', '203.0.113.7'));
  assert(ipInCidr('203.0.113.7', '203.0.113.7/32'));
  assert(ipInCidr('1.2.3.4', '0.0.0.0/0'));
  assert(!ipInCidr('2a00:1450::1', '10.0.0.0/8'));
  const loud = actor({ ip: '10.1.2.3', fn404_distinct: 20, payload_hits: 5 });
  assertEquals(scoreActors([loud], { allowlistCidrs: ['10.1.0.0/16'] }).length, 0);
  assertEquals(scoreActors([loud]).length, 1);
});

Deno.test('distinct-count signals are capped; admin and storage counts are not', () => {
  const s = scoreActor(actor({ fn404_distinct: 100, rest_enum: 100, rpc404_distinct: 100, payload_hits: 100 }));
  assertEquals(s.signals.fn404_distinct, 30);
  assertEquals(s.signals.rest_enum, 30);
  assertEquals(s.signals.rpc404_distinct, 20);
  assertEquals(s.signals.payload_hits, 50);
  const t = scoreActor(actor({ admin_denied: 20, storage_active: 7, fourxx: 0 }));
  assertEquals(t.signals.admin_denied, 80);
  assertEquals(t.signals.storage_active, 70);
});

Deno.test('scanner tooling plus errors is a 5-point hint; a browser with errors is not', () => {
  assertEquals(scoreActor(actor({ ua: 'python-requests/2.31', fourxx: 3 })).score, 5);
  assertEquals(scoreActor(actor({ ua: 'Mozilla/5.0 (iPhone)', fourxx: 3 })).score, 0);
  assertEquals(scoreActor(actor({ ua: 'curl/8.5.0', fourxx: 0, total: 3 })).score, 0);
});

Deno.test('a member whose autocomplete sent "doesn\'t" 27 times is one distinct string at most', () => {
  // The query counts DISTINCT payload strings, so this arrives as payload_hits=1
  // even if the marker list ever matched it. One hit is 10 points: a warning
  // at worst, never the 270-point critical it once was.
  const member = actor({ ua: 'Mozilla/5.0 (Macintosh)', asn_org: 'BT', country: 'GB', fourxx: 0, payload_hits: 1 });
  const s = scoreActor(member);
  assertEquals(s.score, 10);
  assertEquals(scoreActors([member]).length, 0);
});

Deno.test('a successful write sets the CHECK flag and says so in the message', () => {
  const c = scoreActors([actor({ fn404_distinct: 10, write2xx: 1 })])[0];
  assertEquals(c.checkFlag, true);
  assert(c.message.startsWith('CHECK: '));
  assertStringIncludes(c.message, 'A write from this actor SUCCEEDED');
});

Deno.test('clusters are keyed by JA4 and UA, never by network', () => {
  const a = actor({ ip: '1.1.1.1', asn_org: 'Net A', fn404_distinct: 3, fourxx: 0 });
  const b = actor({ ip: '2.2.2.2', asn_org: 'Net B', fn404_distinct: 3, fourxx: 0 });
  const other = actor({ ip: '3.3.3.3', ja4: 't13d0000h2_other_fingerprint', fn404_distinct: 5, fourxx: 0 });
  assertEquals(clusterKey(a), clusterKey(b));
  assert(clusterKey(a) !== clusterKey(other));
  const clusters = scoreActors([a, b, other]);
  assertEquals(clusters.length, 2);
  assertEquals(clusters.find((c) => c.actors.length === 2)?.score, 18);
});

Deno.test('warning between 12 and 24, critical from 25, nothing below 12', () => {
  assertEquals(scoreActors([actor({ fn404_distinct: 3, fourxx: 0 })]).length, 0); // 9
  assertEquals(scoreActors([actor({ fn404_distinct: 4, fourxx: 0 })])[0].severity, 'warning'); // 12
  assertEquals(scoreActors([actor({ fn404_distinct: 8, fourxx: 0 })])[0].severity, 'warning'); // 24
  assertEquals(scoreActors([actor({ fn404_distinct: 8, fourxx: 1 })])[0].severity, 'critical'); // 24 + 5 (curl)
});

Deno.test('legitimate 4xx from real users never touches a signal', () => {
  // An expired magic link (403 on /auth), a customer's typo'd token on an RPC
  // that answers 404 for one real path, an app poll hitting a 401 after sign-out.
  const rows = [
    actor({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)', asn_org: 'SpaceX Services, Inc.', country: 'GB', fourxx: 1 }),
    actor({ ua: 'node', asn_org: 'A100 ROW GmbH', country: 'DE', fourxx: 2, write2xx: 2 }),
  ];
  assertEquals(scoreActors(rows).length, 0);
});
