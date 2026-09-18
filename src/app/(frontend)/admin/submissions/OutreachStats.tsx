import Link from 'next/link';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDateTime } from '@/lib/time';
import p from './submissions.module.css';

/**
 * The five outreach boxes on a submission — emailed, opened, responded,
 * priced, to client — and the list behind each. With onSelect the boxes are
 * buttons (the card's modal); without, links to the submission page with that
 * stage open. No hooks, so it renders on the server or inside the modal.
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

export type OutreachLine = { key: string; who: string; sub?: string; what: string; when: string | null; bad?: boolean };

export const STAGE_TITLES: Record<OutreachStage, string> = {
  emailed: 'Invitation emails',
  opened: 'Opened the job',
  responded: 'Priced or passed',
  priced: 'Prices, then passes',
  client: 'Prices shown to the customer',
};

const STAGE_EMPTY: Record<OutreachStage, string> = {
  emailed: 'No invitation emails recorded.',
  opened: 'Nobody has opened the job yet.',
  responded: 'Nobody has priced or passed yet.',
  priced: 'No prices and no passes yet.',
  client: 'Nothing shown to the customer yet.',
};

function pct(n: number, of: number) {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

export function OutreachStats({
  id,
  counts: r,
  active,
  onSelect,
}: {
  id: string;
  counts: OutreachCounts;
  active?: OutreachStage;
  onSelect?: (stage: OutreachStage) => void;
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
      {cells.map(([key, label, value, hint, warn]) => {
        const className = [p.stat, warn && p.statWarn, active === key && p.statOn].filter(Boolean).join(' ');
        const body = (
          <>
            <span className={p.statLabel}>{label}</span>
            <span className={p.statValue}>{value}</span>
            <small>{hint}</small>
          </>
        );
        return onSelect ? (
          <button
            key={key}
            type="button"
            className={className}
            onClick={() => onSelect(key)}
            aria-pressed={active ? active === key : undefined}
          >
            {body}
          </button>
        ) : (
          <Link
            key={key}
            href={`/admin/submissions/${id}?show=${key}#outreach`}
            className={className}
            aria-current={active === key ? 'true' : undefined}
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}

export function OutreachList({ stage, lines }: { stage: OutreachStage; lines: OutreachLine[] }) {
  if (lines.length === 0) return <div className={p.note}>{STAGE_EMPTY[stage]}</div>;
  return (
    <ul className={p.people}>
      {lines.map((l) => (
        <li key={l.key} className={p.person}>
          <div className={p.personWho}>
            {l.who}
            {l.sub && <small>{l.sub}</small>}
          </div>
          <div className={`${p.personWhat} ${l.bad ? p.personBad : ''}`}>
            {l.what}
            {l.when && <small>{formatDateTime(l.when)}</small>}
          </div>
        </li>
      ))}
    </ul>
  );
}
