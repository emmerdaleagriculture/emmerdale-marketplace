import type { Metadata } from 'next';
import Link from 'next/link';
import { loadLedger } from '@/lib/books/server';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import { isCompany, POINTER_KINDS, type Pointer } from '@/lib/books/taxPointers';
import { taxYearLabel } from '@/lib/books/taxRates';
import { taxView } from '@/lib/books/taxPointers.server';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import kit from '@/components/app/appKit.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { TaxProfileForm } from './TaxProfileForm';
import { toggleTaxDoneAction } from './actions';

export const metadata: Metadata = { title: 'Tax pointers', robots: { index: false, follow: false } };

const ORDER = { risk: 0, saving: 1, check: 2, info: 3 } as const;

/**
 * Tax pointers for this accounting year or last: a rough tax estimate and
 * things in the books worth raising with an accountant. Reads only.
 */
export default async function TaxPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const access = await loadLedger('/account/books/tax');
  const sp = await searchParams;
  const offset = sp.year === 'last' ? -1 : 0;
  const v = await taxView(access.ledger, offset);
  const company = isCompany(v.profile.structure);
  const e = v.estimate;
  const doneKey = (p: Pointer) => `${p.key}|${v.period.from}`;
  const list = [...v.pointers].sort((a, b) => Number(Boolean(v.done[doneKey(a)])) - Number(Boolean(v.done[doneKey(b)])) || ORDER[a.kind] - ORDER[b.kind]);
  const open = list.filter((p) => !v.done[doneKey(p)]);
  const openSavings = open.filter((p) => p.kind === 'saving' && p.valueNote !== 'for each £1,000 paid in, about').reduce((t, p) => t + (p.value ?? 0), 0);

  return (
    <BooksFrame access={access} title="Tax pointers" tab="tax" crumb="Tax pointers">
      <p className={m.sub}>
        {ukDate(v.period.from)} to {ukDate(v.period.to)}
        {v.partYear ? ' (so far)' : ''} ·{' '}
        <Link className={s.link} href="/account/books/tax">
          This year
        </Link>{' '}
        ·{' '}
        <Link className={s.link} href="/account/books/tax?year=last">
          Last year
        </Link>
      </p>
      <p className={s.readOnly}>
        These are pointers to check with your accountant, not tax advice. They’re worked out from what’s in your
        books at {taxYearLabel(v.rates.year)} rates{v.exact ? '' : ' (the latest we have)'}, and nothing here changes
        your books.
      </p>

      <h2 className={m.h2}>Rough tax {v.partYear ? 'on the profit so far' : 'for the year'}</h2>
      <div className={kit.tiles}>
        <div className={kit.tile}>
          <div className={kit.tileLabel}>Profit in the books</div>
          <div className={kit.tileValue}>{formatPence(e.accountsProfit)}</div>
          <div className={kit.tileHint}>
            {formatPence(e.income)} in, {formatPence(e.expenses)} out
          </div>
        </div>
        <div className={kit.tile}>
          <div className={kit.tileLabel}>Taxable profit</div>
          <div className={kit.tileValue}>{formatPence(e.taxableProfit)}</div>
          <div className={kit.tileHint}>
            {[e.allowances ? `less ${formatPence(e.allowances)} equipment` : '', e.disallowed ? `plus ${formatPence(e.disallowed)} entertaining` : '']
              .filter(Boolean)
              .join(', ') || 'Same as the books'}
            {!company && v.profile.profitShare < 100 ? ` · your ${v.profile.profitShare}%: ${formatPence(e.yourProfit)}` : ''}
          </div>
        </div>
        <div className={kit.tile}>
          <div className={kit.tileLabel}>{company ? 'Corporation tax' : 'Income tax and NI'}</div>
          <div className={kit.tileValue}>{formatPence(e.total)}</div>
          <div className={kit.tileHint}>
            {company
              ? 'Before any dividends you take'
              : `${formatPence(e.incomeTax)} income tax, ${formatPence(e.class4)} Class 4 NI`}
          </div>
        </div>
        <div className={kit.tile}>
          <div className={kit.tileLabel}>Next £100 of profit</div>
          <div className={kit.tileValue}>£{e.marginalRate}</div>
          <div className={kit.tileHint}>goes in tax</div>
        </div>
      </div>

      <TaxProfileForm profile={v.profile} canEdit={access.canEdit} />

      <h2 className={m.h2}>
        Pointers{open.length ? ` (${open.length})` : ''}
        {openSavings > 0 ? ` · possible savings about ${formatPence(openSavings)}` : ''}
      </h2>
      {list.length === 0 && <p className={s.muted}>Nothing to point out for this year yet.</p>}
      <div className={s.pointers}>
        {list.map((p) => {
          const done = Boolean(v.done[doneKey(p)]);
          return (
            <article key={p.key} className={s.pointer} data-kind={p.kind} data-done={done ? '' : undefined}>
              <div className={s.kind}>
                {POINTER_KINDS[p.kind]}
                {done ? ' · done' : ''}
              </div>
              <div className={s.pointerHead}>
                <h3>{p.title}</h3>
                {p.value !== undefined && p.value > 0 && (
                  <span className={s.pointerValue}>
                    {p.valueNote ? `${p.valueNote} ` : ''}
                    {formatPence(p.value)}
                  </span>
                )}
              </div>
              <p>{p.why}</p>
              {p.todo && (
                <p>
                  <b>What to do:</b> {p.todo}
                </p>
              )}
              <div className={s.pointerFoot}>
                {p.evidence?.map((ev) => (
                  <Link key={ev.href + ev.label} className={s.link} href={ev.href}>
                    {ev.label}
                  </Link>
                ))}
                <a className={s.link} href={p.link.href} target="_blank" rel="noopener noreferrer">
                  GOV.UK: {p.link.label} ↗
                </a>
                {access.canEdit && (
                  <form action={toggleTaxDoneAction}>
                    <input type="hidden" name="key" value={doneKey(p)} />
                    <input type="hidden" name="done" value={done ? '0' : '1'} />
                    <button type="submit" className={f.btnGhost}>
                      {done ? 'Not done' : 'Mark done'}
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </BooksFrame>
  );
}
