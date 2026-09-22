'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { loadOutreachAction } from './outreach-actions';
import type { Outreach } from './outreach';
import { OutreachList, OutreachStats, STAGE_TITLES, type OutreachCounts, type OutreachStage } from './OutreachStats';
import p from './submissions.module.css';

function pct(n: number, of: number) {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

/**
 * The outreach summary on a submission row. A bar and a line of numbers,
 * opening a modal that lists who is behind each one, with the five stages a
 * tap apart. Lists are fetched fresh each time it opens.
 */
export function OutreachModal({ id, counts, title }: { id: string; counts: OutreachCounts; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<OutreachStage>('emailed');
  const [data, setData] = useState<Outreach | null>(null);
  const [error, setError] = useState(false);
  const [loading, startLoading] = useTransition();

  function open(s: OutreachStage) {
    setStage(s);
    setError(false);
    dialog.current?.showModal();
    startLoading(async () => {
      try {
        setData(await loadOutreachAction(id));
      } catch {
        setError(true);
      }
    });
  }

  const responded = counts.priced + counts.declined;

  return (
    <>
      <button
        type="button"
        className={p.mini}
        onClick={() => open('emailed')}
        aria-label={`${title} — ${counts.invited} invited, ${counts.opened} opened, ${counts.priced} priced. Show who.`}
      >
        <span className={p.bar} aria-hidden="true">
          <span className={p.barResponded} style={{ width: `${pct(responded, counts.invited)}%` }} />
          <span className={p.barOpened} style={{ width: `${pct(Math.max(0, counts.opened - responded), counts.invited)}%` }} />
        </span>
        <span className={p.miniNums} aria-hidden="true">
          <b>{counts.invited}</b> invited · <b>{counts.opened}</b> opened · <b>{counts.priced}</b> priced
          {counts.emails_failed > 0 && <em className={p.miniBad}>{counts.emails_failed} failed to send</em>}
        </span>
      </button>
      <dialog
        ref={dialog}
        className={p.modal}
        aria-label={`${title} — outreach`}
        // A click on the backdrop lands on the dialog itself; inside, on its content.
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
      >
        <div className={p.modalBody}>
          <div className={p.modalHead}>
            <div className={p.modalTitle}>{title}</div>
            <button type="button" className={p.modalClose} onClick={() => dialog.current?.close()} aria-label="Close">
              ×
            </button>
          </div>
          <OutreachStats id={id} counts={data?.counts ?? counts} active={stage} onSelect={setStage} />
          <div className={p.stageTitle}>{STAGE_TITLES[stage]}</div>
          {error ? (
            <div className={p.note}>Couldn’t load this list. Try again.</div>
          ) : !data ? (
            <div className={p.note}>Loading…</div>
          ) : (
            <div style={loading ? { opacity: 0.6 } : undefined}>
              <OutreachList stage={stage} lines={data.lines[stage]} />
            </div>
          )}
          <Link href={`/admin/submissions/${id}?show=${stage}#outreach`} className={p.more}>
            Full job page →
          </Link>
        </div>
      </dialog>
    </>
  );
}
