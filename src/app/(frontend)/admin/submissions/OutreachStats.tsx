import Link from 'next/link';
import { formatGBP } from '@/lib/sealedQuotes/money';
import p from './submissions.module.css';

/**
 * The five outreach boxes on a submission — emailed, opened, responded,
 * priced, to client. Each box links to the submission page with that stage
 * open, listing the contractors (or emails, or quotes) behind the number.
 */

export const OUTREACH_STAGES = ['emailed', 'opened', 'responded', 'priced', 'client'] as const;
export type OutreachStage = (typeof OUTREACH_STAGES)[number];

export function isOutreachStage(v: unknown): v is OutreachStage {
  return OUTREACH_STAGES.includes(v as OutreachStage);
}

export type OutreachCounts = {
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

function pct(n: number, of: number) {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

export function OutreachStats({
  id,
  counts: r,
  active,
}: {
  id: string;
  counts: OutreachCounts;
  active?: OutreachStage;
}) {
  const responded = r.priced + r.declined;
  const cells: [OutreachStage, string, number, string, boolean][] = [
    ['emailed', 'Emailed', r.emails_sent,
      r.emails_failed > 0 ? `${r.emails_failed} failed` : `${r.emails_delivered} delivered`, r.emails_failed > 0],
    ['opened', 'Opened', r.opened, `${pct(r.opened, r.invited)}%`, false],
    ['responded', 'Responded', responded, `${pct(responded, r.invited)}%`, false],
    ['priced', 'Priced', r.priced, `${r.declined} passed`, false],
    ['client', 'To client', r.quotes_live,
      r.lowest_client_pence != null ? `from ${formatGBP(r.lowest_client_pence)}` : 'no prices', false],
  ];

  return (
    <div className={p.stats}>
      {cells.map(([key, label, value, hint, warn]) => (
        <Link
          key={key}
          href={`/admin/submissions/${id}?show=${key}#outreach`}
          className={[p.stat, warn && p.statWarn, active === key && p.statOn].filter(Boolean).join(' ')}
          aria-current={active === key ? 'true' : undefined}
        >
          <span className={p.statLabel}>{label}</span>
          <span className={p.statValue}>{value}</span>
          <small>{hint}</small>
        </Link>
      ))}
    </div>
  );
}
