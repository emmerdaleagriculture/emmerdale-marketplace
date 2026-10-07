import Link from 'next/link';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDateTime } from '@/lib/time';
import p from './submissions.module.css';
import { ContractorLink } from './ContractorLink';

/**
 * The outreach boxes on a submission — emailed, texted, tapped, opened,
 * responded, priced, to client — and the list behind each. With onSelect the boxes are
 * buttons (the card's modal); without, links to the submission page with that
 * stage open. No hooks, so it renders on the server or inside the modal.
 */

export const OUTREACH_STAGES = ['emailed', 'texted', 'tapped', 'opened', 'responded', 'priced', 'client'] as const;
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
  // Invitation texts. Optional until migration 20261006190000 is applied.
  texts_sent?: number;
  texts_delivered?: number;
  texts_failed?: number;
  texts_tapped?: number;
  quotes_live: number;
  lowest_client_pence: number | null;
};

export type OutreachLine = { key: string; who: string; whoId?: string | null; sub?: string; what: string; when: string | null; bad?: boolean };

export const STAGE_TITLES: Record<OutreachStage, string> = {
  emailed: 'Invitation emails',
  texted: 'Invitation texts',
  tapped: 'Tapped the link in the text',
  opened: 'Opened the job',
  responded: 'Priced or passed',
  priced: 'Prices, then passes',
  client: 'Prices shown to the customer',
};

const STAGE_EMPTY: Record<OutreachStage, string> = {
  emailed: 'No invitation emails recorded.',
  texted: 'No invitation texts recorded.',
  tapped: 'Nobody has tapped a text link yet.',
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
  const texted = r.texts_sent ?? 0;
  const textsFailed = r.texts_failed ?? 0;
  const cells: [OutreachStage, string, number, string, boolean][] = [
    ['emailed', 'Emailed', r.emails_sent,
      r.emails_failed > 0 ? `${r.emails_failed} failed` : `${r.emails_delivered} delivered`, r.emails_failed > 0],
    // Delivered is as far as a text can report: SMS has no read receipts.
    ['texted', 'Texted', texted,
      textsFailed > 0 ? `${textsFailed} failed` : `${r.texts_delivered ?? 0} delivered`, textsFailed > 0],
    ['tapped', 'Tapped', r.texts_tapped ?? 0, `${pct(r.texts_tapped ?? 0, texted)}%`, false],
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
            <ContractorLink id={l.whoId}>{l.who}</ContractorLink>
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
