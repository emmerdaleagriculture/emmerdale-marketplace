import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime, timeAgo, timeLeft } from '@/lib/time';
import { formatGBP } from '@/lib/sealedQuotes/money';
import s from '../admin.module.css';
import p from './submissions.module.css';

export const metadata: Metadata = { title: 'Submissions — Admin' };

/**
 * Every job described on /start, newest first, with what happened to it:
 * invitation emails sent and delivered, contractors who opened the job,
 * priced it or passed, and what the customer has been shown. Drafts — people
 * who described a job and stopped before their contact details — are listed
 * too, since they are the funnel's leak.
 *
 * Numbers come from admin_submission_board(), which aggregates in SQL. Cards,
 * not a table, so it works one-handed on a phone.
 */

const LIMIT = 200;

type Row = {
  id: string;
  created_at: string;
  status: string;
  raw_text: string;
  service_verbatim: string | null;
  area_value: number | null;
  area_unit: string | null;
  area_mapped_value: number | null;
  postcode: string | null;
  urgency: string | null;
  target_date: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  confirmed_at: string | null;
  distributed_at: string | null;
  expires_at: string | null;
  awarded_at: string | null;
  photos: number | null;
  service: string | null;
  county: string | null;
  awarded_to: string | null;
  invited: number;
  opened: number;
  priced: number;
  declined: number;
  emails_sent: number;
  emails_delivered: number;
  emails_failed: number;
  quotes_live: number;
  lowest_client_pence: number | null;
};

type Tone = 'open' | 'good' | 'bad' | 'muted' | 'draft';

const STATUS: Record<string, [string, Tone]> = {
  draft: ['Draft', 'draft'],
  abandoned: ['Abandoned draft', 'muted'],
  confirmed: ['Confirmed — sending', 'open'],
  distributed: ['With contractors', 'open'],
  quotes_receiving: ['Quotes in', 'open'],
  accepted_awaiting_payment: ['Awaiting deposit', 'open'],
  awarded: ['Awarded', 'good'],
  contacted: ['Contacted', 'good'],
  scheduled: ['Scheduled', 'good'],
  in_progress: ['In progress', 'good'],
  completed_by_contractor: ['Marked done', 'good'],
  completed: ['Completed', 'good'],
  paid: ['Paid', 'good'],
  variation_pending: ['Variation pending', 'open'],
  variation_declined: ['Variation declined', 'bad'],
  disputed: ['Disputed', 'bad'],
  cancelled: ['Cancelled', 'bad'],
  no_matches: ['No contractors', 'bad'],
  no_quotes: ['No prices', 'bad'],
  expired: ['Expired', 'muted'],
};

const DRAFT = new Set(['draft', 'abandoned']);
const QUOTING = new Set(['confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment']);
const WON = new Set([
  'awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor',
  'completed', 'paid', 'variation_pending', 'variation_declined', 'disputed',
]);

const VIEWS = [
  ['all', 'All'],
  ['quoting', 'Getting quotes'],
  ['won', 'Won'],
  ['closed', 'Closed'],
  ['drafts', 'Drafts'],
] as const;
type View = (typeof VIEWS)[number][0];

function inView(r: Row, view: View): boolean {
  switch (view) {
    case 'drafts': return DRAFT.has(r.status);
    case 'quoting': return QUOTING.has(r.status);
    case 'won': return WON.has(r.status);
    case 'closed': return !DRAFT.has(r.status) && !QUOTING.has(r.status) && !WON.has(r.status);
    default: return true;
  }
}

function clip(text: string, n: number) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function areaLabel(r: Row): string | null {
  if (r.area_mapped_value != null) return `${r.area_mapped_value} acres (drawn)`;
  if (r.area_value == null) return null;
  return `${r.area_value} ${r.area_unit === 'linear_m' ? 'm' : (r.area_unit ?? '')}`.trim();
}

function pct(n: number, of: number) {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

function Card({ r }: { r: Row }) {
  const [label, tone] = STATUS[r.status] ?? [r.status, 'muted'];
  const isDraft = DRAFT.has(r.status);
  const title = r.service ?? (r.service_verbatim ? clip(r.service_verbatim, 70) : clip(r.raw_text, 70));
  const words = clip(r.raw_text, 180);
  const facts = [
    r.county,
    r.postcode,
    areaLabel(r),
    r.urgency ? `${r.urgency}${r.target_date ? ` · by ${r.target_date}` : ''}` : null,
    r.photos ? `${r.photos} photo${r.photos === 1 ? '' : 's'}` : null,
    r.utm_source ? `via ${r.utm_source}` : null,
  ].filter(Boolean) as string[];
  const responded = r.priced + r.declined;

  return (
    <article className={p.card}>
      <div className={p.cardHead}>
        <span className={`${p.status} ${p[tone]}`}>{label}</span>
        <span className={p.when} title={formatDateTime(r.created_at)}>
          {isDraft ? 'Started ' : ''}
          {timeAgo(r.created_at)}
        </span>
      </div>

      <Link href={`/admin/submissions/${r.id}`} className={p.title}>
        {title}
      </Link>
      {words !== title && <div className={p.words}>“{words}”</div>}

      {facts.length > 0 && (
        <div className={p.facts}>
          {facts.map((f) => (
            <span key={f} className={p.fact}>{f}</span>
          ))}
        </div>
      )}

      {r.contact_name || r.contact_phone || r.contact_email ? (
        <div className={p.contact}>
          {r.contact_name && <span>{r.contact_name}</span>}
          {r.contact_phone && <a href={`tel:${r.contact_phone.replace(/\s+/g, '')}`}>{r.contact_phone}</a>}
          {r.contact_email && <a href={`mailto:${r.contact_email}`}>{r.contact_email}</a>}
        </div>
      ) : (
        isDraft && <div className={p.note}>Stopped before leaving contact details.</div>
      )}

      {!isDraft &&
        (r.invited > 0 ? (
          <>
            <dl className={p.stats}>
              <div className={`${p.stat} ${r.emails_failed > 0 ? p.statWarn : ''}`}>
                <dt>Emailed</dt>
                <dd>
                  {r.emails_sent}
                  <small>
                    {r.emails_failed > 0 ? `${r.emails_failed} failed` : `${r.emails_delivered} delivered`}
                  </small>
                </dd>
              </div>
              <div className={p.stat}>
                <dt>Opened</dt>
                <dd>
                  {r.opened}
                  <small>{pct(r.opened, r.invited)}%</small>
                </dd>
              </div>
              <div className={p.stat}>
                <dt>Responded</dt>
                <dd>
                  {responded}
                  <small>{pct(responded, r.invited)}%</small>
                </dd>
              </div>
              <div className={p.stat}>
                <dt>Priced</dt>
                <dd>
                  {r.priced}
                  <small>{r.declined} passed</small>
                </dd>
              </div>
              <div className={p.stat}>
                <dt>To client</dt>
                <dd>
                  {r.quotes_live}
                  <small>{r.lowest_client_pence != null ? `from ${formatGBP(r.lowest_client_pence)}` : 'no prices'}</small>
                </dd>
              </div>
            </dl>
            <div
              className={p.bar}
              role="img"
              aria-label={`${r.opened} of ${r.invited} opened, ${responded} responded`}
            >
              <span className={p.barResponded} style={{ width: `${pct(responded, r.invited)}%` }} />
              <span className={p.barOpened} style={{ width: `${pct(Math.max(0, r.opened - responded), r.invited)}%` }} />
            </div>
          </>
        ) : (
          <div className={p.note}>
            {r.status === 'confirmed' ? 'Confirmed — not sent to contractors yet.' : 'No contractors were invited.'}
          </div>
        ))}

      <div className={p.foot}>
        <span>
          {r.awarded_to
            ? `Won by ${r.awarded_to}`
            : QUOTING.has(r.status) && r.expires_at
              ? `${timeLeft(r.expires_at)} · ${r.invited} invited`
              : isDraft
                ? formatDateTime(r.created_at)
                : r.invited > 0
                  ? `${r.invited} invited`
                  : formatDateTime(r.created_at)}
        </span>
        <Link href={`/admin/submissions/${r.id}`} className={p.more}>
          Details →
        </Link>
      </div>
    </article>
  );
}

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const view: View = VIEWS.some(([k]) => k === sp.view) ? (sp.view as View) : 'all';

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('admin_submission_board', { p_limit: LIMIT });
  const rows = ((data ?? []) as unknown as Row[]);

  const jobs = rows.filter((r) => !DRAFT.has(r.status));
  const drafts = rows.filter((r) => DRAFT.has(r.status));
  const sum = (k: keyof Row) => jobs.reduce((n, r) => n + Number(r[k] ?? 0), 0);
  const invited = sum('invited');
  const sent = sum('emails_sent');
  const delivered = sum('emails_delivered');
  const failed = sum('emails_failed');
  const opened = sum('opened');
  const priced = sum('priced');
  const declined = sum('declined');

  const shown = rows.filter((r) => inView(r, view));
  const shownJobs = shown.filter((r) => !DRAFT.has(r.status));
  const shownDrafts = shown.filter((r) => DRAFT.has(r.status));

  const tiles: [string, string | number, string][] = [
    ['Jobs', jobs.length, `${jobs.filter((r) => QUOTING.has(r.status)).length} getting quotes`],
    ['Emails sent', sent, failed > 0 ? `${delivered} delivered · ${failed} failed` : `${delivered} delivered`],
    ['Opened', opened, `${pct(opened, invited)}% of ${invited} invited`],
    ['Responded', priced + declined, `${priced} priced · ${declined} passed`],
    ['Drafts', drafts.length, 'started, not finished'],
  ];

  return (
    <div>
      <h1 className={s.h1}>Submissions</h1>
      <p className={s.sub}>
        Jobs described on the landing page, newest first
        {rows.length >= LIMIT ? ` — latest ${LIMIT}` : ''}. Opened means the
        contractor opened the job from their email.
      </p>

      {error && <div className={s.blocked}>Couldn’t load submissions: {error.message}</div>}

      <div className={p.tiles}>
        {tiles.map(([label, value, hint]) => (
          <div key={label} className={p.tile}>
            <div className={p.tileValue}>{value}</div>
            <div className={p.tileLabel}>{label}</div>
            <div className={p.tileHint}>{hint}</div>
          </div>
        ))}
      </div>

      <nav className={p.chips} aria-label="Filter submissions">
        {VIEWS.map(([key, name]) => (
          <Link
            key={key}
            href={key === 'all' ? '/admin/submissions' : `/admin/submissions?view=${key}`}
            className={`${p.chip} ${view === key ? p.chipOn : ''}`}
            aria-current={view === key ? 'page' : undefined}
          >
            {name} <b>{rows.filter((r) => inView(r, key)).length}</b>
          </Link>
        ))}
      </nav>

      {view !== 'drafts' && (
        <>
          {view === 'all' && <div className={s.sectionLabel}>Jobs</div>}
          {shownJobs.length === 0 ? (
            <div className={s.empty}>Nothing here yet.</div>
          ) : (
            <div className={p.cards}>
              {shownJobs.map((r) => (
                <Card key={r.id} r={r} />
              ))}
            </div>
          )}
        </>
      )}

      {(view === 'all' || view === 'drafts') && (
        <>
          <div className={s.sectionLabel}>Drafts — described a job, didn’t finish</div>
          {shownDrafts.length === 0 ? (
            <div className={s.empty}>No drafts.</div>
          ) : (
            <div className={p.cards}>
              {shownDrafts.map((r) => (
                <Card key={r.id} r={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
