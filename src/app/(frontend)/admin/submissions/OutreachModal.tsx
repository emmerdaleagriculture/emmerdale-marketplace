'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { loadOutreachAction } from './outreach-actions';
import type { Outreach } from './outreach';
import { OutreachList, OutreachStats, STAGE_TITLES, type OutreachCounts, type OutreachStage } from './OutreachStats';
import p from './submissions.module.css';

/**
 * The outreach boxes on a submission card. Tapping one opens a modal listing
 * who is behind the number, with the other four a tap away. Lists are fetched
 * fresh each time it opens.
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

  return (
    <>
      <OutreachStats id={id} counts={counts} onSelect={open} />
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
