import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import s from '../admin.module.css';
import { AdminTable, Tile, Tiles } from '../ui';

export const metadata: Metadata = { title: 'Priority Access — Admin' };
export const dynamic = 'force-dynamic';

/**
 * Priority Access, run in the shadows (20261001160000_priority_access_shadow).
 *
 * The scheme: a contractor who books work through the platform sees new jobs
 * in their area first; one who prices promptly sees them next; everyone
 * else when the window opens. Nothing on this page changes what contractors
 * see. It shows what the scheme would do, against what actually happened,
 * so the decision to switch it on is made on numbers.
 *
 * Three questions, in order: who would hold each standing (and would there
 * be anyone in Priority for a given county at all); whether holding a job
 * back would have cost it its first price; and whether the bookings we do
 * get come from the contractors the scheme would favour.
 */

type Standing = {
  contractor_id: string;
  tier: string;
  won: number;
  priced: number;
  median_hours: number | null;
  flags: number;
  rejected_msgs: number;
  moderated: boolean;
  clean: boolean;
  reasons: string[];
  computed_on: string;
};

type Shadow = {
  submission_id: string;
  county_id: number | null;
  distributed_at: string;
  direct: boolean;
  backfilled: boolean;
  invited: number;
  priority_ids: string[];
  responsive_ids: string[];
  first_price_tier: string | null;
  first_price_hours: number | null;
  first_price_delay_h: number | null;
  prices_priority: number;
  prices_responsive: number;
  prices_standard: number;
  booked_tier: string | null;
  outcome: string | null;
};

const TIER_LABEL: Record<string, string> = {
  priority: 'Priority',
  responsive: 'Responsive',
  standard: 'Standard',
};

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '—');
const h = (n: number | null) => (n == null ? '—' : `${n}h`);

export default async function PriorityPage() {
  const admin = createServiceRoleClient();
  const since = new Date(Date.now() - 90 * 86400000).toISOString();

  const [standingQ, shadowQ, contractorsQ, countiesQ, coverQ, flagsQ, configQ] = await Promise.all([
    admin.from('contractor_standing_latest').select('*'),
    admin.from('priority_shadow').select('*').gte('distributed_at', since).order('distributed_at', { ascending: false }),
    admin.from('contractors').select('id, business_name, status').eq('status', 'approved'),
    admin.from('counties').select('id, name'),
    admin.from('contractor_counties').select('contractor_id, county_id'),
    admin
      .from('platform_flags')
      .select('id, created_at, rule, surface, sender, submission_id, contractor_id')
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('app_config').select('key, value').like('key', 'sq_priority_%'),
  ]);
  for (const q of [standingQ, shadowQ, contractorsQ, countiesQ, coverQ, flagsQ]) {
    if (q.error) throw new Error(`Priority page read failed: ${q.error.message}`);
  }

  const standings = (standingQ.data ?? []) as Standing[];
  const shadow = (shadowQ.data ?? []) as Shadow[];
  const names = new Map((contractorsQ.data ?? []).map((c) => [c.id, c.business_name]));
  const countyName = new Map((countiesQ.data ?? []).map((c) => [c.id, c.name]));
  const tierOf = new Map(standings.map((r) => [r.contractor_id, r.tier]));
  const config = Object.fromEntries((configQ.data ?? []).map((r) => [r.key, String(r.value)]));

  // ── Standing ────────────────────────────────────────────────────────
  const byTier = { priority: 0, responsive: 0, standard: 0 } as Record<string, number>;
  for (const r of standings) byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
  const unclean = standings.filter((r) => !r.clean).length;
  const computedOn = standings[0]?.computed_on ?? null;
  const notable = standings
    .filter((r) => r.tier !== 'standard' || !r.clean || r.priced > 0)
    .sort((a, b) => {
      const order = { priority: 0, responsive: 1, standard: 2 } as Record<string, number>;
      return order[a.tier] - order[b.tier] || b.won - a.won || b.priced - a.priced;
    });

  // ── Per county: would there be anyone to see the job first? ──────────
  const countyJobs = new Map<number, number>();
  for (const j of shadow) if (j.county_id != null) countyJobs.set(j.county_id, (countyJobs.get(j.county_id) ?? 0) + 1);
  const countyTiers = new Map<number, { priority: number; responsive: number; standard: number }>();
  for (const c of coverQ.data ?? []) {
    const t = tierOf.get(c.contractor_id);
    if (!t) continue; // not approved and vetted
    const row = countyTiers.get(c.county_id) ?? { priority: 0, responsive: 0, standard: 0 };
    row[t as keyof typeof row] += 1;
    countyTiers.set(c.county_id, row);
  }
  const countyRows = [...countyJobs]
    .map(([id, jobs]) => ({ id, name: countyName.get(id) ?? `County ${id}`, jobs, ...(countyTiers.get(id) ?? { priority: 0, responsive: 0, standard: 0 }) }))
    .sort((a, b) => b.jobs - a.jobs);

  // ── The window against what happened ────────────────────────────────
  const priced = shadow.filter((j) => j.first_price_tier);
  const booked = shadow.filter((j) => j.booked_tier);
  const withPriority = shadow.filter((j) => j.priority_ids.length > 0).length;
  const withAny = shadow.filter((j) => j.priority_ids.length + j.responsive_ids.length > 0).length;
  const firstBy = { priority: 0, responsive: 0, standard: 0 } as Record<string, number>;
  for (const j of priced) firstBy[j.first_price_tier!] += 1;
  const delayed = priced.filter((j) => (j.first_price_delay_h ?? 0) > 0);
  const avg = (xs: number[]) => (xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : null);
  const avgFirst = avg(priced.map((j) => j.first_price_hours ?? 0));
  const avgDelay = avg(delayed.map((j) => j.first_price_delay_h ?? 0));
  // Jobs where nobody in the first two windows ever priced: the market
  // would have waited the full window for nothing.
  const starved = priced.filter((j) => j.prices_priority + j.prices_responsive === 0).length;
  const bookedBy = { priority: 0, responsive: 0, standard: 0 } as Record<string, number>;
  for (const j of booked) bookedBy[j.booked_tier!] += 1;

  const flags = flagsQ.data ?? [];

  return (
    <>
      <h1 className={s.h1}>Priority Access</h1>
      <p className={s.sub}>
        A shadow run. Nothing here changes who is invited or when: it scores every contractor nightly
        and records what the scheme would have done on each job, beside what happened.{' '}
        {computedOn ? `Standing last computed ${computedOn}.` : 'Standing not computed yet.'}{' '}
        Window: Priority at once, Responsive after {config.sq_priority_window_hours ?? '24'}h, everyone after{' '}
        {config.sq_responsive_window_hours ?? '48'}h. Priority = booked a job in {config.sq_priority_won_days ?? '180'} days;
        Responsive = priced {config.sq_priority_priced_min ?? '3'}+ jobs in {config.sq_priority_priced_days ?? '60'} days with a
        median under {config.sq_priority_response_hours ?? '24'}h; both need a clean {config.sq_priority_clean_days ?? '90'} days.
      </p>

      <div className={s.sectionLabel}>Who would hold each standing</div>
      <Tiles>
        <Tile value={byTier.priority} label="Priority" hint="booked through the platform, clean record" />
        <Tile value={byTier.responsive} label="Responsive" hint="price promptly, haven't won yet" />
        <Tile value={byTier.standard} label="Standard" hint="everyone else approved and vetted" />
        <Tile value={unclean} label="Standing lost" hint="a flag, a removed message or moderation" warn />
      </Tiles>

      <div className={s.sectionLabel}>The window, against the last 90 days of jobs</div>
      <Tiles>
        <Tile value={shadow.length} label="Jobs distributed" hint={`${priced.length} got a price, ${booked.length} booked`} />
        <Tile
          value={pct(withPriority, shadow.length)}
          label="Had a Priority contractor in range"
          hint={`${pct(withAny, shadow.length)} had Priority or Responsive`}
        />
        <Tile
          value={pct(firstBy.priority + firstBy.responsive, priced.length)}
          label="First price from Priority or Responsive"
          hint={`${firstBy.priority} Priority · ${firstBy.responsive} Responsive · ${firstBy.standard} Standard`}
        />
        <Tile
          value={pct(delayed.length, priced.length)}
          label="First prices the window would have held back"
          hint={avgDelay != null ? `by ${avgDelay}h on average; first price today takes ${h(avgFirst)}` : undefined}
          warn={delayed.length > priced.length / 2}
        />
        <Tile
          value={pct(starved, priced.length)}
          label="Priced only by Standard"
          hint="the window would have waited its full length for nothing"
          warn={starved > 0}
        />
        <Tile
          value={booked.length ? `${bookedBy.priority + bookedBy.responsive} of ${booked.length}` : '—'}
          label="Bookings from Priority or Responsive"
          hint={booked.length ? `${bookedBy.priority} Priority · ${bookedBy.responsive} Responsive · ${bookedBy.standard} Standard` : 'no bookings in the period'}
        />
      </Tiles>

      <div className={s.sectionLabel}>By county — counties with a job in 90 days</div>
      <AdminTable head={['County', 'Jobs', 'Priority', 'Responsive', 'Standard']}>
        {countyRows.map((c) => (
          <tr key={c.id}>
            <td>{c.name}</td>
            <td>{c.jobs}</td>
            <td style={c.priority === 0 ? { color: 'var(--error)' } : undefined}>{c.priority}</td>
            <td>{c.responsive}</td>
            <td>{c.standard}</td>
          </tr>
        ))}
      </AdminTable>

      <div className={s.sectionLabel}>Contractors with a standing to show</div>
      <AdminTable head={['Contractor', 'Standing', 'Won', 'Priced', 'Median to price', 'Why']}>
        {notable.map((r) => (
          <tr key={r.contractor_id}>
            <td>
              <Link href={`/admin/contractors/${r.contractor_id}`}>{names.get(r.contractor_id) ?? r.contractor_id.slice(0, 8)}</Link>
            </td>
            <td style={!r.clean ? { color: 'var(--error)' } : undefined}>{TIER_LABEL[r.tier] ?? r.tier}</td>
            <td>{r.won}</td>
            <td>{r.priced}</td>
            <td>{h(r.median_hours)}</td>
            <td>{r.reasons.join('; ')}</td>
          </tr>
        ))}
      </AdminTable>

      <div className={s.sectionLabel}>Recent jobs through the shadow window</div>
      <AdminTable head={['Distributed', 'County', 'Invited', 'P / R in range', 'First price', 'Would wait', 'Prices P / R / S', 'Booked', 'Now']}>
        {shadow.slice(0, 40).map((j) => (
          <tr key={j.submission_id}>
            <td>
              <Link href={`/admin/submissions/${j.submission_id}`}>{formatDateTime(j.distributed_at)}</Link>
              {j.direct ? ' (direct first)' : ''}
            </td>
            <td>{j.county_id != null ? countyName.get(j.county_id) ?? '—' : '—'}</td>
            <td>{j.invited}</td>
            <td>
              {j.priority_ids.length} / {j.responsive_ids.length}
            </td>
            <td>{j.first_price_tier ? `${TIER_LABEL[j.first_price_tier]} at ${h(j.first_price_hours)}` : '—'}</td>
            <td style={(j.first_price_delay_h ?? 0) > 0 ? { color: 'var(--error)' } : undefined}>
              {j.first_price_tier ? (j.first_price_delay_h ? `+${j.first_price_delay_h}h` : 'no') : '—'}
            </td>
            <td>
              {j.prices_priority} / {j.prices_responsive} / {j.prices_standard}
            </td>
            <td>{j.booked_tier ? TIER_LABEL[j.booked_tier] : '—'}</td>
            <td>{j.outcome ?? '—'}</td>
          </tr>
        ))}
      </AdminTable>

      <div className={s.sectionLabel}>Refused messages and notes</div>
      {flags.length === 0 ? (
        <p className={s.empty}>Nothing recorded yet. Recording began on 1 Oct 2026; earlier refusals were emailed only.</p>
      ) : (
        <AdminTable head={['When', 'Who', 'Where', 'Rule', 'Job']}>
          {flags.map((f) => (
            <tr key={f.id}>
              <td>{formatDateTime(f.created_at)}</td>
              <td>{f.sender === 'customer' ? 'Customer' : (f.contractor_id && names.get(f.contractor_id)) || 'Contractor'}</td>
              <td>{f.surface}</td>
              <td>{f.rule.replace(/_/g, ' ')}</td>
              <td>{f.submission_id ? <Link href={`/admin/submissions/${f.submission_id}`}>{f.submission_id.slice(0, 8)}</Link> : '—'}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </>
  );
}
