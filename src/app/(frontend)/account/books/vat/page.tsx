import type { Metadata } from 'next';
import Link from 'next/link';
import { loadLedger } from '@/lib/books/server';
import { formatPence } from '@/lib/books/money';
import { isIsoDate, todayUk, ukDate } from '@/lib/books/period';
import {
  BOX_LABELS,
  VAT_THRESHOLD_PENCE,
  computeReturn,
  preRegCandidates,
  quarters,
  taxableTurnover,
  thresholdState,
  vatNotPosted,
  type Boxes,
} from '@/lib/books/vatReturn';
import { preRegEntry, purchasesWithAccount, unpostedReceiptCount, vatEntries } from '@/lib/books/vat.server';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import kit from '@/components/app/appKit.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { PreRegForm } from './PreRegForm';

export const metadata: Metadata = { title: 'VAT', robots: { index: false, follow: false } };

function addYears(iso: string, n: number) {
  return `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`.replace(/-02-29$/, '-02-28');
}

/**
 * VAT. Registered: the nine-box return for a quarter (or any dates), with
 * CSVs for the accountant or bridging software, and the one-off
 * pre-registration reclaim. Not registered: turnover against the threshold
 * and the VAT that could be reclaimed on registering.
 */
export default async function VatPage({ searchParams }: { searchParams: Promise<{ q?: string; from?: string; to?: string; prereg?: string }> }) {
  const access = await loadLedger('/account/books/vat');
  const l = access.ledger;
  const sp = await searchParams;
  const today = todayUk();

  if (!l.vat_registered) {
    const from = addYears(today, -1);
    const entries = await vatEntries(l.id, from, today);
    const turnover = taxableTurnover(entries);
    const state = thresholdState(turnover);
    const pct = Math.min(100, Math.round((turnover / VAT_THRESHOLD_PENCE) * 100));
    const candidates = preRegCandidates(await purchasesWithAccount(l.id, addYears(today, -4), today), today);
    const reclaimable = candidates.filter((c) => c.eligible).reduce((t, c) => t + c.vat_pence, 0);
    return (
      <BooksFrame access={access} title="VAT" tab="vat" crumb="VAT">
        <p className={m.lead}>
          You’re not VAT registered, so your sales don’t charge VAT. You must register if your taxable turnover in
          any 12 months goes over {formatPence(VAT_THRESHOLD_PENCE).replace('.00', '')}.
        </p>
        <div className={kit.tile} style={{ marginBottom: 24 }}>
          <div className={kit.tileLabel}>Taxable turnover, 12 months to {ukDate(today)}</div>
          <div className={kit.tileValue}>{formatPence(turnover)}</div>
          <div className={s.meter} aria-hidden="true">
            <span style={{ width: `${pct}%` }} className={state === 'over' ? s.meterOver : state === 'near' ? s.meterNear : undefined} />
          </div>
          <div className={kit.tileHint}>
            {pct}% of the threshold.{' '}
            {state === 'over'
              ? 'You’re over: you must register within 30 days of the end of the month you went over.'
              : state === 'near'
                ? 'You’re getting close. Keep an eye on it each month.'
                : ''}
          </div>
        </div>
        <h2 className={m.h2}>If you registered today</h2>
        <p className={m.sub}>
          You could reclaim about <b>{formatPence(reclaimable)}</b> of VAT already paid: on equipment and stock bought in
          the last 4 years that you still have, and on services in the last 6 months. Once you’re registered, tick
          VAT registered in <Link className={s.link} href="/account/books/settings">Settings</Link> and the reclaim
          appears here.
        </p>
        <p className={m.fine}>
          Turnover counts sales recorded as taxable (not exempt or outside the scope). It’s a guide, not advice: check
          with your accountant before registering.
        </p>
      </BooksFrame>
    );
  }

  const stagger = (l.vat_quarter_stagger ?? 0) as 0 | 1 | 2;
  const qs = quarters(today, stagger, 8);
  const qi = Math.min(Math.max(Number(sp.q ?? 0) || 0, 0), qs.length - 1);
  let from = isIsoDate(sp.from) ? sp.from : qs[qi].from;
  const to = isIsoDate(sp.to) ? sp.to : qs[qi].to;
  const reg = l.vat_registration_date;
  const clipped = Boolean(reg && from < reg);
  if (reg && from < reg) from = reg;
  const [entries, unposted, prereg] = await Promise.all([vatEntries(l.id, from, to), unpostedReceiptCount(l.id, from, to), preRegEntry(l.id)]);
  const scheme = { vat_scheme: l.vat_scheme as 'standard', flat_rate_percent: l.flat_rate_percent == null ? null : Number(l.flat_rate_percent) };
  const { boxes, detail } = computeReturn(entries, scheme);
  const notPosted = vatNotPosted(entries, scheme);
  const q = `from=${from}&to=${to}`;
  const wholePounds = (k: keyof Boxes) => k >= 6;

  const candidates = reg && !prereg ? preRegCandidates(await purchasesWithAccount(l.id, addYears(reg, -4), reg), reg) : [];

  return (
    <BooksFrame access={access} title="VAT return" tab="vat" crumb="VAT">
      {sp.prereg && <p className={s.notice}>Pre-registration reclaim posted. It’s in box 4 of your first return.</p>}
      <form className={s.filters} method="get">
        <label>
          Quarter
          <select className={f.input} name="q" defaultValue={String(qi)}>
            {qs.map((p, i) => (
              <option key={p.from} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button className={f.btnGhost} type="submit">
          Show
        </button>
      </form>
      <p className={m.sub}>
        {ukDate(from)} to {ukDate(to)}
        {clipped ? ' (from your registration date)' : ''} · {l.vat_scheme === 'flat_rate' ? `flat rate ${l.flat_rate_percent}%` : l.vat_scheme === 'cash' ? 'cash accounting' : 'standard accounting'}
      </p>
      {unposted > 0 && (
        <p className={s.readOnly}>
          <b>{unposted} receipt{unposted === 1 ? '' : 's'} not posted yet</b> may belong in this period.{' '}
          <Link href="/account/books/receipts">Check them first →</Link>
        </p>
      )}
      {notPosted.length > 0 && (
        <div className={s.readOnly}>
          <b>
            {notPosted.length} entr{notPosted.length === 1 ? 'y' : 'ies'} in this period {notPosted.length === 1 ? 'was' : 'were'} recorded before
            you switched VAT registration on
          </b>
          , so {notPosted.length === 1 ? 'its' : 'their'} VAT isn’t in these figures:{' '}
          {notPosted
            .slice(0, 5)
            .map((e) => `${e.counterparty ?? e.description ?? `#${e.id}`} (${ukDate(e.entry_date)}, VAT ${formatPence(e.vat_pence)})`)
            .join('; ')}
          {notPosted.length > 5 ? '…' : ''}. Void {notPosted.length === 1 ? 'it' : 'them'} in the{' '}
          <Link href="/account/books/journal">journal</Link> and post again to include the VAT.
        </div>
      )}
      <div className={m.tableWrap}>
        <table className={m.table}>
          <tbody>
            {(Object.keys(BOX_LABELS) as unknown as (keyof Boxes)[]).map((k) => (
              <tr key={k} className={k === 5 ? s.totalRow : undefined}>
                <td>Box {k}</td>
                <td style={{ whiteSpace: 'normal' }}>{BOX_LABELS[k]}</td>
                <td className={m.num}>{wholePounds(k) ? formatPence(boxes[k]).replace(/\.\d\d$/, '') : formatPence(boxes[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={m.fine}>
        Download:{' '}
        <a className={s.link} href={`/account/books/vat.csv?${q}&type=summary`}>
          summary
        </a>{' '}
        ·{' '}
        <a className={s.link} href={`/account/books/vat.csv?${q}&type=detail`}>
          every entry
        </a>
        . Books doesn’t file returns with HMRC yet: give these to your accountant, or use bridging software for Making
        Tax Digital. Each entry’s date is used as its tax point.
      </p>

      {detail.length > 0 && (
        <details className={m.tableToggle} style={{ marginTop: 20 }}>
          <summary>The {detail.length} entries behind these figures</summary>
          <div className={m.tableWrap} style={{ marginTop: 10 }}>
            <table className={m.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Who</th>
                  <th>Code</th>
                  {[1, 4, 6, 7].map((b) => (
                    <th key={b} className={m.num}>
                      Box {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.map(({ entry, boxes: b }) => (
                  <tr key={entry.id}>
                    <td>{ukDate(entry.entry_date)}</td>
                    <td>{entry.counterparty ?? entry.description ?? ''}</td>
                    <td>{entry.vat_code}</td>
                    {([1, 4, 6, 7] as const).map((k) => (
                      <td key={k} className={m.num}>
                        {b[k] != null ? formatPence(b[k]!) : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {reg && !prereg && access.canEdit && (
        <>
          <h2 className={m.h2}>Reclaim VAT from before you registered</h2>
          {candidates.length === 0 ? (
            <p className={m.sub}>No purchases with VAT in the 4 years before {ukDate(reg)}.</p>
          ) : (
            <>
              <p className={m.sub}>
                Once, when you register: VAT on equipment and stock bought in the 4 years before {ukDate(reg)} that you
                still have, and on services in the 6 months before. Tick what applies. It posts on your registration
                date and goes in box 4 of your first return.
              </p>
              <PreRegForm rows={candidates} />
            </>
          )}
        </>
      )}
      {prereg && (
        <p className={m.fine}>
          Pre-registration reclaim of {formatPence(prereg.vat_pence)} posted on {ukDate(prereg.entry_date)}.
        </p>
      )}
    </BooksFrame>
  );
}
