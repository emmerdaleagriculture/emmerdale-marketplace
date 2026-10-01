'use client';

import { useActionState, useEffect, useState } from 'react';
import { emptyFormState, type FormState } from '@/lib/form';
import { londonDay } from '@/lib/time';
import type { MessageSender } from '@/lib/sealedQuotes/messageText';
import type { ThreadVisit, VisitContact } from '@/lib/sealedQuotes/visits';
import f from '@/components/forms/forms.module.css';
import s from './messages.module.css';

export type VisitAction = (prev: FormState, data: FormData) => Promise<FormState>;

export function Hidden({ hidden }: { hidden: Record<string, string> }) {
  return (
    <>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

function statusLine(v: ThreadVisit, me: MessageSender, otherName: string): string {
  const mine = v.proposedBy === me;
  switch (v.status) {
    case 'proposed':
      return mine ? `Suggested by you — waiting for ${otherName}` : `Suggested by ${otherName}`;
    case 'accepted':
      return v.past ? 'Visit took place' : 'Agreed — see you then';
    case 'held':
      return 'Visit took place';
    case 'declined':
      return mine ? `${otherName} can’t make it` : 'You couldn’t make it';
    case 'withdrawn':
      return 'Withdrawn';
    case 'cancelled':
      return v.cancelledBy === 'system'
        ? 'Called off — the job has moved on'
        : v.cancelledBy === me
          ? 'Called off by you'
          : `Called off by ${otherName}`;
    case 'lapsed':
      return 'Not answered before the job moved on';
  }
}

/** One visit, in the thread where it was suggested. */
export function VisitCard({
  visit,
  me,
  otherName,
  action,
  hidden,
  contact,
}: {
  visit: ThreadVisit;
  me: MessageSender;
  otherName: string;
  action: VisitAction | null;
  hidden: Record<string, string>;
  /** The other side's details, shown on an agreed visit. */
  contact: VisitContact | null;
}) {
  const [state, formAction, pending] = useActionState(action ?? (async () => emptyFormState), emptyFormState);
  const live = visit.status === 'proposed' || (visit.status === 'accepted' && !visit.past);
  const theirs = visit.proposedBy !== me;

  return (
    <div
      className={`${s.visit} ${live ? s.visitLive : s.visitDone} ${visit.proposedBy === me ? s.mine : s.theirs}`}
    >
      <span className={s.visitTitle}>Site visit · {visit.when}</span>
      <span className={s.visitStatus}>{statusLine(visit, me, otherName)}</span>

      {(visit.status === 'accepted' || visit.status === 'held') && contact && contact.lines.length > 0 && (
        <div className={s.visitContact}>
          <span className={s.visitContactTitle}>{contact.title}</span>
          {contact.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}

      {action && live && (
        <form action={formAction} className={s.visitActions}>
          <Hidden hidden={{ ...hidden, visit_id: visit.id }} />
          {state.error && <p className={f.error}>{state.error}</p>}
          {visit.status === 'proposed' && theirs && (
            <>
              <p className={s.visitNote}>
                {me === 'client'
                  ? `Accepting gives ${otherName} your address and phone number for the visit, and shows you who they are.`
                  : 'Accepting gives you the customer’s address and phone number for the visit.'}
              </p>
              <button className={f.btnPrimary} type="submit" name="op" value="accept" disabled={pending}>
                Accept
              </button>
              <button className={f.btnGhost} type="submit" name="op" value="decline" disabled={pending}>
                Can’t make it
              </button>
            </>
          )}
          {visit.status === 'proposed' && !theirs && (
            <button className={f.btnGhost} type="submit" name="op" value="cancel" disabled={pending}>
              Withdraw
            </button>
          )}
          {visit.status === 'accepted' && (
            <button className={f.btnGhost} type="submit" name="op" value="cancel" disabled={pending}>
              Call off the visit
            </button>
          )}
        </form>
      )}
    </div>
  );
}

/** Half-hourly, 7am to 7pm: daylight hours for walking a field. */
const TIMES = Array.from({ length: 25 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});

/** "Suggest a site visit": a day and a time, sent to the other side to answer. */
export function VisitProposer({
  me,
  otherName,
  action,
  hidden,
  replacing,
}: {
  me: MessageSender;
  otherName: string;
  action: VisitAction;
  hidden: Record<string, string>;
  /** A suggestion is already waiting; a new one replaces it. */
  replacing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  // The date input wants a local "today"; computed in the browser so the
  // server render and the first paint agree on nothing that could differ.
  const [min, setMin] = useState<string>();
  useEffect(() => setMin(londonDay(Date.now())), []);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  // "Arrange a site visit" on a price card sends the page here (#visit-<thread>):
  // the form is open and in view when they arrive, not a button to find.
  const anchor = `visit-${hidden.invitation_id ?? 'thread'}`;
  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${anchor}`) {
        setOpen(true);
        document.getElementById(anchor)?.scrollIntoView({ block: 'center' });
      }
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [anchor]);

  if (!open) {
    return (
      <button id={anchor} type="button" className={s.visitOpen} onClick={() => setOpen(true)}>
        {replacing ? 'Suggest a different time' : 'Suggest a site visit'}
      </button>
    );
  }

  return (
    <form id={anchor} action={formAction} className={s.visitForm}>
      <Hidden hidden={{ ...hidden, op: 'propose' }} />
      <p className={s.visitNote}>
        {me === 'contractor'
          ? 'Need to see the ground before you can stand behind a price? Suggest a time. If the customer accepts, you get their address and phone number, and they get your name and number.'
          : `Suggest a time for ${otherName} to come and see the site. If they accept, they get your address and phone number, and you get their name and number.`}
        {replacing ? ' This replaces the time waiting for an answer.' : ''}
      </p>
      {state.error && <p className={f.error}>{state.error}</p>}
      <div className={s.visitFields}>
        <label className={f.field}>
          <span className={f.label}>Day</span>
          <input className={f.input} type="date" name="date" min={min} required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Time</span>
          <select className={f.input} name="time" defaultValue="10:00" required>
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={s.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Suggest this time'}
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
