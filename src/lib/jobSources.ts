import { channelOf, UNATTRIBUTED, type Attributed } from '@/lib/attribution';

/**
 * Where each confirmed job came from, for the dashboard donut.
 *
 * A job's own columns answer it when they can. They often can't for the early
 * jobs: before #143 (26 Sept) the homepage → /start hand-off overwrote the
 * source with `site:home`, and before #155 (28 Sept) no referrer was stored on
 * the job at all. Those jobs are traced back the way the 28 Sept audit did it:
 * the parse event nearest the submission gives the visitor's IP, and that IP's
 * landing views in the three days before say how they first arrived.
 */

export type SourceSub = Attributed & { id: string; created_at: string };
export type ParseEvent = { ip: string; created_at: string };
export type LandingView = Attributed & { ip: string | null; created_at: string };

/** The coarse groups the donut shows; `channelOf` is the fine one. */
export const SOURCE_GROUPS = [
  'Facebook / Instagram ads',
  'Facebook / Instagram, untagged',
  'Google Ads',
  'Search (organic)',
  'Other websites',
  'Enquiries & leads',
  'Unknown',
] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number];

export function groupOf(channel: string): SourceGroup {
  if (channel.startsWith('Meta —')) return 'Facebook / Instagram ads';
  if (channel === 'Facebook — untagged' || channel === 'Instagram — untagged') return 'Facebook / Instagram, untagged';
  if (channel === 'Google Ads') return 'Google Ads';
  if (channel === 'Organic search') return 'Search (organic)';
  if (channel.startsWith('Referral —')) return 'Other websites';
  if (channel === 'Hay-bales lead import') return 'Enquiries & leads';
  return 'Unknown';
}

/** A channel that says nothing about the outside world. */
const uninformative = (channel: string) => channel === UNATTRIBUTED || channel.startsWith('Internal —');

const MATCH_SECONDS = 60;
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

export type JobSource = { id: string; created_at: string; channel: string; recovered: boolean };

export function jobSources(subs: SourceSub[], parses: ParseEvent[], views: LandingView[]): JobSource[] {
  const viewsByIp = new Map<string, LandingView[]>();
  for (const v of views) {
    if (!v.ip) continue;
    const list = viewsByIp.get(v.ip) ?? [];
    list.push(v);
    viewsByIp.set(v.ip, list);
  }
  const parseTimes = parses.map((p) => ({ ip: p.ip, t: Date.parse(p.created_at) }));

  return subs.map((sub) => {
    const own = channelOf(sub);
    if (!uninformative(own)) return { id: sub.id, created_at: sub.created_at, channel: own, recovered: false };

    const t = Date.parse(sub.created_at);
    let ip: string | null = null;
    let best = MATCH_SECONDS * 1000;
    for (const p of parseTimes) {
      const gap = Math.abs(p.t - t);
      if (gap <= best) {
        best = gap;
        ip = p.ip;
      }
    }
    // First touch: the earliest view in the window that names a source.
    const first = (ip ? viewsByIp.get(ip) ?? [] : [])
      .filter((v) => {
        const vt = Date.parse(v.created_at);
        return vt <= t && vt >= t - LOOKBACK_MS;
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((v) => channelOf(v))
      .find((c) => !uninformative(c));
    return first
      ? { id: sub.id, created_at: sub.created_at, channel: first, recovered: true }
      : { id: sub.id, created_at: sub.created_at, channel: own, recovered: false };
  });
}
