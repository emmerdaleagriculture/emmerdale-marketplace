'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { submitFeedbackAction } from './actions';
import { useViewer } from '@/components/useViewer';
import type { FormState } from '@/lib/form';
import s from './feedback.module.css';

const EMPTY: FormState = {};

/**
 * "Something's not right" — on every page, for everyone.
 *
 * A tab pinned to the bottom corner rather than a link in the footer,
 * because the person worth hearing from is annoyed right now and is not
 * going to go looking. It opens in place: nothing they have typed elsewhere
 * on the page is lost, and there is no page to come back from.
 *
 * Signed-in visitors are not asked for an email — the action already has it
 * from their session, and asking a contractor for an address we emailed them
 * at reads as a form that is not paying attention. Signed-out visitors get an
 * optional box, because a reply needs somewhere to go.
 *
 * Not on /admin: the people who read this are the only ones there.
 */
export function FeedbackWidget() {
  const pathname = usePathname() ?? '';
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(submitFeedbackAction, EMPTY);
  const [renderedAt, setRenderedAt] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);

  // Set on open, not on mount: the bot trap measures how long the form was
  // in front of a human, and a tab left open for an hour is not a signal.
  useEffect(() => {
    if (open) {
      setRenderedAt(Date.now());
      box.current?.focus();
    }
  }, [open]);

  // Close on Escape like any other dismissible layer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (pathname.startsWith('/admin')) return null;

  return (
    <div className={s.root}>
      {open && (
        <div className={s.panel} role="dialog" aria-label="Send feedback">
          <div className={s.head}>
            <strong>How&rsquo;s it going?</strong>
            <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          {state.ok ? (
            <p className={s.done}>{state.message}</p>
          ) : (
            <form action={act}>
              <input type="hidden" name="path" value={pathname} />
              <input type="hidden" name="form_ts" value={renderedAt} />
              {/* Honeypot — off screen, never announced, never tabbed to. */}
              <div className={s.hp} aria-hidden="true">
                <label>
                  Leave this empty
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <label className={s.field}>
                <span className={s.label}>
                  Anything at all — what&rsquo;s broken, what&rsquo;s missing, what&rsquo;s annoying
                </span>
                <textarea ref={box} className={s.textarea} name="message" rows={4} required maxLength={4000} />
              </label>

              {!viewer.signedIn && (
                <label className={s.field}>
                  <span className={s.label}>Email, if you&rsquo;d like a reply</span>
                  <input className={s.input} type="email" name="email" autoComplete="email" />
                </label>
              )}

              {state.error && <p className={s.error}>{state.error}</p>}

              <button type="submit" className={s.send} disabled={pending}>
                {pending ? 'Sending…' : 'Send'}
              </button>
              <p className={s.note}>
                We&rsquo;ll see the page you were on.
                {viewer.signedIn ? ' Your account comes with it, so we can reply.' : ''}
              </p>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        className={s.tab}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? 'Close' : 'Feedback'}
      </button>
    </div>
  );
}
