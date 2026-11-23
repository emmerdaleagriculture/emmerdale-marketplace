import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { loadLedger } from '@/lib/books/server';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import {
  figuresHash,
  filingAvailable,
  filingYears,
  listFilings,
  pollFilings,
  readiness,
  readSecrets,
  storedDocuments,
  yearEndView,
  type CheckResult,
  type Filing,
} from '@/lib/books/filing.server';
import { DOCUMENT_LABELS, isTestKey } from '@/lib/books/tinytax';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import kit from '@/components/app/appKit.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { YearEndForm } from './YearEndForm';
import { AutoRefresh, FileButton } from './FilePanel';
import { refreshFilingsAction, resetFiguresAction } from './actions';

export const metadata: Metadata = { title: 'Year end', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = {
  sending: 'Sending (answer not back yet)',
  pending: 'Waiting',
  submitted: 'Submitted, waiting for an answer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  error: 'Error',
  failed: 'Refused by TinyTax',
};

/**
 * Books › Year end: a limited company's accounts and CT600, from the books,
 * checked by TinyTax and filed through it. HPM first (tinytax_allowlist).
 */
export default async function YearEndPage({ searchParams }: { searchParams: Promise<{ end?: string }> }) {
  const access = await loadLedger('/account/books/year-end');
  const l = access.ledger;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  // Viewers (an accountant) may look; the allowlist is checked against the owner's account.
  const ownerEmail = access.viewing ? await ownerEmailOf(l.contractor_id) : user?.email;
  if (!(await filingAvailable(l, ownerEmail))) redirect('/account/books');

  const years = await filingYears(l);
  const sp = await searchParams;
  // Default: the latest year that has ended and is in the books, else this one.
  const year = years.find((y) => y.to === sp.end) ?? years.find((y) => y.ended && !y.beforeBooks) ?? years[0];
  const period = { from: year.from, to: year.to };

  const { data: contractor } = await createServiceRoleClient().from('contractors').select('contact_name').eq('id', l.contractor_id).maybeSingle();
  const view = await yearEndView(l, period, contractor?.contact_name ?? '');
  const ready = readiness(l);
  const sandbox = Boolean(readSecrets(l).apiKey && isTestKey(readSecrets(l).apiKey!));
  let filings = await listFilings(l.id);
  if (access.canEdit) filings = await pollFilings(l, filings);
  const thisYear = filings.filter((x) => x.period_end === period.to);
  const live = (kind: string) => thisYear.find((x) => x.kind === kind && x.sandbox === sandbox && ['sending', 'pending', 'submitted', 'accepted'].includes(x.status));
  const onTheirWay = filings.some((x) => ['sending', 'pending', 'submitted'].includes(x.status));

  const check = view.lastCheck;
  const fresh = Boolean(check && check.hash === figuresHash(view.figures));
  const blockedFor = (kind: 'ct600' | 'accounts'): string | null => {
    const existing = live(kind);
    if (existing) return existing.status === 'accepted' ? 'Already filed and accepted for this year.' : 'Already sent; see below.';
    if (!ready.ok) return `Add your ${ready.missing.join(', ')} in Settings first.`;
    if (!year.ended) return `You can file once the year ends on ${ukDate(year.to)}.`;
    if (!check) return 'Check the figures with TinyTax first.';
    if (!fresh) return 'The figures have changed since the last check. Check them again.';
    if (!check[kind].ok) return 'TinyTax’s check found problems. Fix them and check again.';
    return null;
  };

  return (
    <BooksFrame access={access} title="Year end" tab="year-end" crumb="Year end">
      <AutoRefresh active={onTheirWay} />
      <p className={m.sub}>
        {ukDate(period.from)} to {ukDate(period.to)} ·{' '}
        {years.map((y, i) => (
          <span key={y.to}>
            {i > 0 && ' · '}
            {y.to === period.to ? (
              <b>Year to {ukDate(y.to)}</b>
            ) : (
              <Link className={s.link} href={`/account/books/year-end?end=${y.to}`}>
                Year to {ukDate(y.to)}
              </Link>
            )}
          </span>
        ))}
      </p>
      <p className={s.readOnly}>
        Company accounts to Companies House and the CT600 to HMRC, filed through TinyTax on your own TinyTax account. The figures start
        from your books; check every one, change any that need it, then let TinyTax check them. Nothing is filed until you press File.
        {sandbox && <b> Test key: everything goes to TinyTax’s sandbox only.</b>}
      </p>

      {!ready.ok && access.canEdit && (
        <p className={s.notice}>
          Before you can check or file, add your {ready.missing.join(', ')} in{' '}
          <Link className={s.link} href="/account/books/settings#filing">
            Settings
          </Link>
          .
        </p>
      )}

      {year.beforeBooks ? (
        <p className={s.notice}>
          The year to {ukDate(year.to)} was brought into Books as opening balances, so its profit and loss isn’t here and it can’t be
          filed from Books. File it the way you did before; Books can file the years after it.
        </p>
      ) : (
        <>
          {!year.ended && (
            <p className={s.notice}>
              This year is still running (it ends {ukDate(year.to)}), so the figures are the year so far. You can prepare and check them
              now; filing opens when the year ends.
            </p>
          )}
          <h2 className={m.h2}>Figures</h2>
          {view.edited && access.canEdit && (
            <form action={resetFiguresAction} style={{ marginBottom: 8 }}>
              <input type="hidden" name="period_end" value={period.to} />
              <span className={s.muted}>You’ve edited these. </span>
              <button type="submit" className={f.btnGhost}>
                Start again from the books
              </button>
            </form>
          )}
          <YearEndForm
            key={`${period.to}-${check?.at ?? ''}-${view.edited}`}
            periodEnd={period.to}
            figures={view.figures}
            fromBooks={view.fromBooks}
            canEdit={access.canEdit}
            canCheck={year.ended}
            dlaOverdrawn={view.dlaOverdrawn}
          />

          {check && (
            <>
              <h2 className={m.h2}>
                TinyTax’s check{' '}
                <span className={s.muted} style={{ fontSize: 14, fontWeight: 400 }}>
                  {new Date(check.at).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })}
                  {fresh ? '' : ' · figures changed since'}
                </span>
              </h2>
              <div className={kit.tiles}>
                <CheckTile title="CT600 (HMRC)" r={check.ct600} />
                <CheckTile title="Accounts (Companies House)" r={check.accounts} />
              </div>
            </>
          )}

          {access.canEdit && (
            <>
              <h2 className={m.h2}>File</h2>
              <div className={s.pointers}>
                <FileButton kind="accounts" periodEnd={period.to} blocked={blockedFor('accounts')} sandbox={sandbox} />
                <FileButton kind="ct600" periodEnd={period.to} blocked={blockedFor('ct600')} sandbox={sandbox} />
              </div>
              <p className={m.fine}>
                Accounts are due at Companies House 9 months after the year end, and the CT600 at HMRC 12 months after. Corporation
                tax is due 9 months and a day after the year end; TinyTax doesn’t pay it for you.
              </p>
            </>
          )}
        </>
      )}

      <h2 className={m.h2}>Filings</h2>
      {filings.length === 0 && <p className={s.muted}>Nothing filed from Books yet.</p>}
      {filings.length > 0 && (
        <div className={m.tableWrap}>
          <table className={m.table}>
            <thead>
              <tr>
                <th>Year to</th>
                <th>What</th>
                <th>Status</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              {filings.map((x) => (
                <FilingRow key={x.id} x={x} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {onTheirWay && access.canEdit && (
        <form action={refreshFilingsAction} style={{ marginTop: 8 }}>
          <button type="submit" className={f.btnGhost}>
            Check for an answer now
          </button>
        </form>
      )}
    </BooksFrame>
  );
}

async function ownerEmailOf(contractorId: string): Promise<string | null> {
  const { data } = await createServiceRoleClient().auth.admin.getUserById(contractorId);
  return data.user?.email ?? null;
}

function CheckTile({ title, r }: { title: string; r: CheckResult }) {
  if (!r.ok) {
    return (
      <div className={kit.tile}>
        <div className={kit.tileLabel}>{title}</div>
        <div className={kit.tileValue}>Problems</div>
        <div className={kit.tileHint} style={{ whiteSpace: 'pre-wrap' }}>
          {r.error}
        </div>
      </div>
    );
  }
  const c = r.result.calculated;
  const warnings = r.result.warnings ?? [];
  return (
    <div className={kit.tile}>
      <div className={kit.tileLabel}>{title}</div>
      <div className={kit.tileValue}>
        {c?.corporation_tax !== undefined ? `£${c.corporation_tax.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tax` : 'Passed'}
      </div>
      <div className={kit.tileHint}>
        {[
          r.result.derived_values?.company_name,
          r.result.accounts_type && `Accounts: ${r.result.accounts_type.replace('micro_frs105', 'micro-entity (FRS 105)').replace('small_frs102', 'small (FRS 102)')}`,
          c?.taxable_profit !== undefined && `Taxable profit ${formatPence(Math.round(c.taxable_profit * 100))}`,
          c?.losses_carried_forward ? `Losses carried forward ${formatPence(Math.round(c.losses_carried_forward * 100))}` : null,
          c?.loans_to_participators_tax ? `Includes ${formatPence(Math.round(c.loans_to_participators_tax * 100))} s455 on the director’s loan` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        {warnings.map((w) => (
          <div key={w.code}>⚠ {w.message}</div>
        ))}
      </div>
    </div>
  );
}

function FilingRow({ x }: { x: Filing }) {
  const docs = storedDocuments(x);
  const st = x.last_status as { hmrc_iru_number?: string | null; ch_submission_number?: string | null } | null;
  const ref = st?.hmrc_iru_number || st?.ch_submission_number;
  return (
    <tr>
      <td>{ukDate(x.period_end)}</td>
      <td>
        {x.kind === 'ct600' ? 'CT600 to HMRC' : 'Accounts to Companies House'}
        {x.sandbox && <div className={s.muted}>Test (sandbox)</div>}
      </td>
      <td>
        <b>{STATUS[x.status] ?? x.status}</b>
        <div className={s.muted} style={{ fontSize: 13 }}>
          {new Date(x.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })}
          {ref ? ` · ref ${ref}` : ''}
        </div>
        {x.error && (x.status === 'rejected' || x.status === 'error' || x.status === 'failed' || x.status === 'sending') && (
          <div className={f.error} style={{ fontSize: 13 }}>
            {x.error}
          </div>
        )}
      </td>
      <td>
        {docs.length === 0 && <span className={s.muted}>{x.status !== 'accepted' ? '—' : x.sandbox ? 'None in the sandbox' : 'Fetching…'}</span>}
        {docs.map((d) => (
          <div key={d.type}>
            <a className={s.link} href={`/account/books/year-end/doc/${x.id}/${d.type}`}>
              {DOCUMENT_LABELS[d.type] ?? d.type}
            </a>
          </div>
        ))}
      </td>
    </tr>
  );
}
