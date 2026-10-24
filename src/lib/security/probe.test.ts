import { describe, expect, it } from 'vitest';
import {
  collapseByIp,
  heartbeatVerdict,
  isCheckFlagged,
  parseProbeClusterKey,
  probeLogsUrl,
  ruleLabel,
  splitClusterKey,
  stripClusterTag,
} from './probe';

const msg =
  'Scan from 3 networks incl. Hostinger (ES), curl/8.5.0: 70 IPs, 350 requests over 1.6h (23:07 to 00:44 UTC): ' +
  '92 unknown function names. No write from this actor succeeded. [cluster:t13d1516h2_8daaf6152771_02713d6af862|curl/8.5.0]';

describe('the cluster tag', () => {
  it('is stripped before a person reads the message', () => {
    expect(stripClusterTag(msg)).toBe(
      'Scan from 3 networks incl. Hostinger (ES), curl/8.5.0: 70 IPs, 350 requests over 1.6h (23:07 to 00:44 UTC): ' +
        '92 unknown function names. No write from this actor succeeded.',
    );
    expect(stripClusterTag(`${msg} [backfill]`)).not.toContain('[');
  });
  it('is parsed into the key the events were written under', () => {
    expect(parseProbeClusterKey(msg)).toBe('t13d1516h2_8daaf6152771_02713d6af862|curl/8.5.0');
    expect(parseProbeClusterKey(`${msg} [backfill]`)).toBe('t13d1516h2_8daaf6152771_02713d6af862|curl/8.5.0');
    expect(parseProbeClusterKey('The detector has not succeeded for an hour.')).toBeNull();
  });
  it('splits into fingerprint and user agent, even when the UA has a bar in it', () => {
    expect(splitClusterKey('t13d|mozilla/5.0 (x|y)')).toEqual({ ja4: 't13d', ua: 'mozilla/5.0 (x|y)' });
    expect(splitClusterKey('noja4')).toEqual({ ja4: 'noja4', ua: '' });
  });
});

describe('reading a card', () => {
  it('knows when a write succeeded', () => {
    expect(isCheckFlagged('CHECK: Scan from ...')).toBe(true);
    expect(isCheckFlagged(msg)).toBe(false);
  });
  it('names every rule in words, and falls back to the rule itself', () => {
    expect(ruleLabel('probe_scan')).toBe('Security probe');
    expect(ruleLabel('some_new_rule')).toBe('some new rule');
  });
  it('links to the Logs Explorer filtered to the fingerprint only', () => {
    const u = new URL(probeLogsUrl("t13d_abc' or 1=1"));
    expect(u.hostname).toBe('supabase.com');
    expect(u.pathname).toContain('/logs/explorer');
    expect(u.searchParams.get('q')).toContain("bm.ja4 = 't13d_abcor11'");
  });
});

describe('collapsing events to one row per IP', () => {
  const row = (ip: string, at: string, score: number, requests = 1) => ({
    actor_ip: ip,
    asn_org: null,
    country: null,
    requests,
    ip_score: score,
    check_flag: false,
    detected_at: at,
    top_paths: [],
    response_action: null,
  });
  it('keeps the newest firing per IP and sorts by score', () => {
    const out = collapseByIp([
      row('1.1.1.1', '2026-10-24T10:00:00Z', 5),
      row('1.1.1.1', '2026-10-24T11:00:00Z', 9),
      row('2.2.2.2', '2026-10-24T10:30:00Z', 20),
    ]);
    expect(out.map((r) => [r.actor_ip, r.ip_score])).toEqual([
      ['2.2.2.2', 20],
      ['1.1.1.1', 9],
    ]);
  });
});

describe('the heartbeat tile', () => {
  const now = Date.parse('2026-10-24T15:00:00Z');
  it('says never run until a firing completes', () => {
    expect(heartbeatVerdict(null, now)).toMatchObject({ label: 'never run', bad: true });
    expect(heartbeatVerdict({ consecutive_failures: 2, last_failure_detail: 'HTTP 502' }, now)).toMatchObject({
      label: 'never succeeded',
      bad: true,
      detail: 'HTTP 502',
    });
  });
  it('is fine within the hour, stopped after it', () => {
    expect(heartbeatVerdict({ last_success_end: '2026-10-24T14:50:00Z' }, now)).toMatchObject({ label: 'scanning', bad: false });
    expect(heartbeatVerdict({ last_success_end: '2026-10-24T13:30:00Z' }, now)).toMatchObject({ label: 'stopped 90m ago', bad: true });
    expect(heartbeatVerdict({ last_success_end: '2026-10-24T09:00:00Z' }, now)).toMatchObject({ label: 'stopped 6h ago', bad: true });
  });
  it('mentions failures that have not yet broken the hour', () => {
    expect(heartbeatVerdict({ last_success_end: '2026-10-24T14:40:00Z', consecutive_failures: 1 }, now)).toMatchObject({
      label: '1 failure since last success',
      bad: false,
    });
  });
});
