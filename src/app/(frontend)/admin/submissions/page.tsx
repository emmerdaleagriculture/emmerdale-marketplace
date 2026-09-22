import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dayHeading, formatDate, formatDateTime, londonDay, timeAgo, timeLeft } from '@/lib/time';
import { URGENCY_LABELS } from '@/components/job/JobSpecCard';
import s from '../admin.module.css';
import p from './submissions.module.css';
import { SUBMISSION_FILTERS, isSubmissionFilter, matchesFilter } from '@/lib/submissionFilters';
import { OutreachModal } from './OutreachModal';
import { DraftToolbar } from './DraftToolbar';

export const metadata: Metadata = { title: 'Submissions — Admin' };

/**
 * Every job described on /start, newest first, with what happened to it:
 * invitation emails sent and delivered, contractors who opened the job,
 * priced it or passed, and what the customer has been shown.
 *
 * One compact line per job, banded into days, so a fortnight's work reads at a
 * glance instead of scrolling. Rows stack rather than scroll sideways, so the
 * page still works one-handed on a phone. Drafts — people who described a job
 * and stopped before their contact details — are the funnel's leak and there
 * are more of them than jobs, so they live behind their own tab.
 *
 * Numbers come from admin_submission_board(), which aggregates in SQL.
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
  hidden_at: string | null;
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
  ['all', 'All jobs'],
  ['quoting', 'Getting quotes'],
  ['won', 'Won'],
  ['closed', 'Closed'],
  ['drafts', 'Drafts'],
] as const;
type View = (typeof VIEWS)[number][0];

/** "All jobs" means jobs: drafts outnumber them, and have their own tab. */
function inView(r: Row, view: View): boolean {
  switch (view) {
    case 'drafts': return DRAFT.has(r.status);
    case 'quoting': return QUOTING.has(r.status);
    case 'won': return WON.has(r.status);
    case 'closed': return !DRAFT.has(r.status) && !QUOTING.has(r.status) && !WON.has(r.status);
    default: return !DRAFT.has(r.status);
  }
}

/** Newest-first rows into newest-first days. */
function byDay(rows: Row[]): [string, Row[]][] {
  const days = new Map<string, Row[]>();
  for (const r of rows) {
    const key = londonDay(r.created_at);
    const day = days.get(key);
    if (day) day.push(r);
    else days.set(key, [r]);
  }
  return [...days];
}

/** One line of whitespace-normalised text. */
function tidy(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

function clip(text: string, n: number) {
  const t = tidy(text);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Does `text` open with `prefix`, ignoring case? */
function starts(text: string, prefix: string) {
  return text.toLowerCase().startsWith(prefix.toLowerCase());
}

function areaLabel(r: Row): string | null {
  if (r.area_mapped_value != null) return `${r.area_mapped_value} acres (drawn)`;
  if (r.area_value == null) return null;
  return `${r.area_value} ${r.area_unit === 'linear_m' ? 'm' : (r.area_unit ?? '')}`.trim();
}

function pct(n: number, of: number) {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

/** One submission, one line: what it is, where it got to, how long ago. */
function SubmissionRow({ r, selectable = false }: { r: Row; selectable?: boolean }) {
  const [label, tone] = STATUS[r.status] ?? [r.status, 'muted'];
  const isDraft = DRAFT.has(r.status);
  const raw = tidy(r.raw_text);
  const service = r.service ?? (r.service_verbatim ? tidy(r.service_verbatim) : null);
  // Often the "service" is the customer's sentence back again — nothing was
  // parsed, or service_verbatim is the whole message — so one of the two only
  // restates the other and the row would print it twice. Then show whichever
  // says more and quote nothing underneath.
  const restates =
    service != null &&
    (starts(service, raw) || (starts(raw, service) && raw.length - service.length < 20));
  const fullest = service && service.length > raw.length ? service : raw;
  const title = service == null || restates ? clip(fullest, 110) : clip(service, 70);
  const words = service != null && !restates ? clip(raw, 120) : null;
  const facts = [
    r.county,
    r.postcode,
    areaLabel(r),
    r.urgency
      ? r.urgency === 'dated' && r.target_date
        ? `By ${formatDate(r.target_date)}`
        : (URGENCY_LABELS[r.urgency] ?? r.urgency)
      : null,
    r.photos ? `${r.photos} photo${r.photos === 1 ? '' : 's'}` : null,
    r.utm_source ? `via ${r.utm_source}` : null,
  ].filter(Boolean) as string[];

  // The one thing worth knowing about where this job stands, under the numbers.
  const standing = r.awarded_to
    ? `Won by ${r.awarded_to}`
    : QUOTING.has(r.status) && r.expires_at
      ? timeLeft(r.expires_at)
      : null;

  return (
    <li className={p.row}>
      {/* Plain input inside the bulk form — no client state, and it still
          works with JavaScript off. Only drafts are ever selectable. */}
      {selectable && (
        <input type="checkbox" name="ids" value={r.id} className={p.rowPick} aria-label={`Select ${title}`} />
      )}
      <span className={`${p.status} ${p[tone]}`}>{label}</span>

      <div className={p.rowMain}>
        <Link href={`/admin/submissions/${r.id}`} className={p.title}>
          {title}
        </Link>
        {words && words !== title && <p className={p.words}>“{words}”</p>}
        {facts.length > 0 && (
          <p className={p.facts}>
            {facts.map((f, i) => (
              <span key={f} className={p.fact}>
                {i > 0 && <i aria-hidden="true"> · </i>}
                {f}
              </span>
            ))}
          </p>
        )}
        {(r.contact_name || r.contact_phone || r.contact_email) && (
          <p className={p.contact}>
            {r.contact_name && <span>{r.contact_name}</span>}
            {r.contact_phone && <a href={`tel:${r.contact_phone.replace(/\s+/g, '')}`}>{r.contact_phone}</a>}
            {r.contact_email && <a href={`mailto:${r.contact_email}`}>{r.contact_email}</a>}
          </p>
        )}
      </div>

      <div className={p.rowOutreach}>
        {isDraft ? (
          !r.contact_name && !r.contact_phone && !r.contact_email && (
            <span className={p.note}>No contact details left</span>
          )
        ) : r.invited > 0 ? (
          <>
            <OutreachModal id={r.id} counts={r} title={title} />
            {standing && <span className={p.standing}>{standing}</span>}
          </>
        ) : (
          <span className={p.note}>
            {r.status === 'confirmed' ? 'Not sent to contractors yet' : 'No contractors were invited'}
          </span>
        )}
      </div>

      <div className={p.rowWhen}>
        <span title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}</span>
        <Link href={`/admin/submissions/${r.id}`} className={p.more} aria-label={`Details — ${title}`}>
          Details →
        </Link>
      </div>
    </li>
  );
}

/** A list banded into days, newest first. */
function Days({ rows, selectable = false }: { rows: Row[]; selectable?: boolean }) {
  return (
    <>
      {byDay(rows).map(([key, day]) => (
        <section key={key} className={p.day}>
          <h2 className={p.dayHead}>
            {dayHeading(day[0].created_at)} <span className={p.dayCount}>{day.length}</span>
          </h2>
          <ul className={p.rows}>
            {day.map((r) => (
              <SubmissionRow key={r.id} r={r} selectable={selectable} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const view: View = VIEWS.some(([k]) => k === sp.view) ? (sp.view as View) : 'all';

  // Set when arriving from a dashboard tile: show just the jobs behind it.
  const filter = isSubmissionFilter(sp.filter) ? sp.filter : null;

  // ?hidden=1 on the drafts tab: the ones cleared off the board, so they can
  // be put back. Nothing else ever asks for them.
  const showHidden = view === 'drafts' && sp.hidden === '1';

  const admin = createServiceRoleClient();
  const ids = async (q: PromiseLike<{ data: { submission_id: string | null }[] | null }>) =>
    new Set(((await q).data ?? []).map((r) => r.submission_id));
  const [{ data, error }, pricedIds, paidIds] = await Promise.all([
    admin.rpc('admin_submission_board', { p_limit: LIMIT, p_include_hidden: showHidden }),
    filter === 'priced' ? ids(admin.from('client_quotes').select('submission_id')) : new Set<string | null>(),
    filter === 'paid'
      ? ids(admin.from('job_payments').select('submission_id').in('status', ['paid', 'partially_refunded', 'refunded']))
      : new Set<string | null>(),
  ]);
  const all = ((data ?? []) as unknown as Row[]);
  // When showing hidden we asked for everything; the tab shows only those.
  const rows = showHidden ? all.filter((r) => r.hidden_at) : all;
  const { count: hiddenCount } = await admin
    .from('job_submissions')
    .select('id', { count: 'exact', head: true })
    .not('hidden_at', 'is', null);

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

  // A dashboard filter overrides the tabs: it is its own list.
  const shown = filter
    ? rows.filter((r) => matchesFilter(r, filter, { priced: pricedIds, paid: paidIds }))
    : rows.filter((r) => inView(r, view));

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
        contractor opened the job from their email; tap the numbers on a row to
        see who.
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

      {filter ? (
        <nav className={p.chips} aria-label="Filter submissions">
          <span className={`${p.chip} ${p.chipOn}`} aria-current="page">
            {SUBMISSION_FILTERS[filter]} <b>{shown.length}</b>
          </span>
          <Link href="/admin/submissions" className={p.chip}>
            Show all
          </Link>
        </nav>
      ) : (
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
      )}

      {!filter && view === 'drafts' && (
        <p className={p.lede}>
          {showHidden
            ? 'Drafts cleared off the board. Tick any you want back.'
            : 'Described a job on /start and stopped before leaving contact details.'}{' '}
          {showHidden ? (
            <Link href="/admin/submissions?view=drafts">Back to the live ones</Link>
          ) : (
            hiddenCount != null &&
            hiddenCount > 0 && (
              <Link href="/admin/submissions?view=drafts&hidden=1">
                {hiddenCount} cleared — show {hiddenCount === 1 ? 'it' : 'them'}
              </Link>
            )
          )}
        </p>
      )}

      {shown.length === 0 ? (
        <div className={s.empty}>
          {filter
            ? 'Nothing matches.'
            : view === 'drafts'
              ? showHidden
                ? 'Nothing cleared.'
                : 'No drafts.'
              : 'Nothing here yet.'}
        </div>
      ) : !filter && view === 'drafts' ? (
        <DraftToolbar count={shown.length} showingHidden={showHidden}>
          <Days rows={shown} selectable />
        </DraftToolbar>
      ) : (
        <Days rows={shown} />
      )}
    </div>
  );
}
