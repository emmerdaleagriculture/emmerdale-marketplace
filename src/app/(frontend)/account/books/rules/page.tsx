import type { Metadata } from 'next';
import Link from 'next/link';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { isPurchaseCategory } from '@/lib/books/chart';
import { loadRules } from '@/lib/books/rules.server';
import { statementAccounts } from '@/lib/books/bank.server';
import { VAT_CODES } from '@/lib/books/vat';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { deleteRuleAction } from './actions';
import { RuleForm } from './RuleForm';

export const metadata: Metadata = { title: 'Rules', robots: { index: false, follow: false } };

/**
 * The owner's rules: where a payee's bank rows and a supplier's receipts go,
 * and what pays them. They beat history and the AI.
 */
export default async function RulesPage({ searchParams }: { searchParams: Promise<{ match?: string }> }) {
  const { match } = await searchParams;
  const access = await loadLedger('/account/books/rules');
  const l = access.ledger;
  const [accounts, rules] = await Promise.all([getAccounts(l.id), loadRules(l.id)]);
  const name = new Map(accounts.map((a) => [a.code, a.name]));
  const limited = l.business_type === 'limited_company';
  const personal = limited ? '2300' : '3000';
  const payLabel = (code: string) =>
    code === personal
      ? `Paid personally (${code} ${name.get(code) ?? ''})`
      : code === '2100'
        ? 'On credit: invoices paid later (2100)'
        : code === '1100'
          ? 'Customer pays later (1100)'
          : `${code} ${name.get(code) ?? ''}`;
  const payers = [
    ...statementAccounts(accounts).map((a) => a.code),
    ...['2100', '1100', personal].filter((c) => name.has(c)),
  ].map((code) => ({ code, name: payLabel(code), group: '' }));
  const options = accounts
    .filter((a) => !['1220', '2201', '2202'].includes(a.code))
    .map((a) => ({
      code: a.code,
      name: a.name,
      group: a.type === 'income' ? 'Income' : a.type === 'expense' ? 'Expenses' : isPurchaseCategory(a) ? 'Fixed assets' : 'Other accounts',
    }));

  return (
    <BooksFrame access={access} title="Rules" tab="bank" crumb="Rules">
      <p className={m.lead}>
        Tell your books where things go. A rule decides where a payee’s bank statement rows and a supplier’s
        receipts are booked, and what pays them, ahead of “as last time” and the AI. Rules apply to statements
        uploaded and receipts read from now on; change rows already booked on the{' '}
        <Link className={s.link} href="/account/books/bank">
          statement page
        </Link>
        .
      </p>

      <h2 className={m.h2}>Your rules</h2>
      {!rules.length ? (
        <p className={m.sub}>None yet.</p>
      ) : (
        <div className={m.tableWrap}>
          <table className={m.table}>
            <thead>
              <tr>
                <th>Contains</th>
                <th>Goes to</th>
                <th>VAT</th>
                <th>Paid by</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    “{r.match_text}”{r.direction !== 'any' && <div className={s.muted}>money {r.direction} only</div>}
                  </td>
                  <td>{r.account_code ? `${r.account_code} ${name.get(r.account_code) ?? ''}` : '—'}</td>
                  <td>{r.vat_code ? VAT_CODES[r.vat_code].label : '—'}</td>
                  <td>{r.paid_from ? payLabel(r.paid_from) : '—'}</td>
                  <td>
                    {access.canEdit && (
                      <form action={deleteRuleAction}>
                        <input type="hidden" name="rule_id" value={r.id} />
                        <button type="submit" className={f.btnGhost}>
                          Remove
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {access.canEdit && (
        <>
          <h2 className={m.h2}>Add a rule</h2>
          <RuleForm accounts={options} payers={payers} defaultMatch={(match ?? '').slice(0, 100)} />
        </>
      )}
    </BooksFrame>
  );
}
