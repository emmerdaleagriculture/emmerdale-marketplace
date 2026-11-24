'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { askUsAction } from './askActions';
import type { FormState } from '@/lib/form';
import s from './home.module.css';

// window.gtag is declared once, in @/components/Analytics.

const EMPTY: FormState = {};

/**
 * "Not sure what needs doing? Ask us!" — under the widget's Get started.
 *
 * The widget asks for the name of a job. Someone with an overgrown paddock
 * and no idea whether that is topping, flailing or spraying cannot answer,
 * and had nowhere to go but away. This opens in place, takes the problem in
 * their words and a way to reach them, and sends it to us, not to
 * contractors.
 *
 * Closed by default: one line of text, so it costs the people who do know
 * what they want nothing. The postcode and service already typed into the
 * widget come along, so nobody is asked twice.
 */
export function AskUs({ postcode, service }: { postcode: string; service: string }) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(askUsAction, EMPTY);
  const [renderedAt, setRenderedAt] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  // Controlled, because React clears an uncontrolled form once its action
  // returns: a missing phone number must not cost them what they wrote.
  const [f, setF] = useState({ message: '', name: '', email: '', phone: '' });
  const bind = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: { target: { value: string } }) => setF((v) => ({ ...v, [k]: e.target.value })),
  });

  // Set on open, not on mount: the bot trap measures how long the form was
  // in front of a human.
  useEffect(() => {
    if (open) {
      setRenderedAt(Date.now());
      box.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (state.ok) window.gtag?.('event', 'ask_us_sent', { source: 'hero' });
  }, [state.ok]);

  const toggle = () => {
    if (!open) window.gtag?.('event', 'ask_us_open', { source: 'hero' });
    setOpen((o) => !o);
  };

  return (
    <div className={s.ask}>
      <p className={s.askLine}>
        Not sure what needs doing?{' '}
        <button type="button" className={s.askToggle} onClick={toggle} aria-expanded={open}>
          Ask us!
        </button>
      </p>

      {open &&
        (state.ok ? (
          <p className={s.askDone} role="status">
            {state.message}
          </p>
        ) : (
          <form action={act} className={s.askForm}>
            <input type="hidden" name="form_ts" value={renderedAt} />
            <input type="hidden" name="postcode" value={postcode} />
            <input type="hidden" name="service" value={service} />
            {/* Honeypot — off screen, never announced, never tabbed to. */}
            <div className={s.askHp} aria-hidden="true">
              <label>
                Leave this empty
                <input type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <div className={s.widgetField}>
              <label className={s.widgetLabel} htmlFor="ask-message">
                What&rsquo;s the problem?
              </label>
              <textarea
                id="ask-message"
                ref={box}
                name="message" {...bind('message')}
                className={s.askTextarea}
                rows={4}
                required
                maxLength={4000}
                placeholder="In your own words, e.g. two acres of rough grass and docks, and I don’t know where to start."
              />
            </div>

            <div className={s.widgetField}>
              <label className={s.widgetLabel} htmlFor="ask-name">
                Your name
              </label>
              <input id="ask-name" name="name" {...bind('name')} type="text" className={s.widgetInput} autoComplete="name" maxLength={120} />
            </div>

            <div className={s.widgetField}>
              <label className={s.widgetLabel} htmlFor="ask-email">
                Email
              </label>
              <input id="ask-email" name="email" {...bind('email')} type="email" className={s.widgetInput} autoComplete="email" />
            </div>

            <div className={s.widgetField}>
              <label className={s.widgetLabel} htmlFor="ask-phone">
                Phone
              </label>
              <input id="ask-phone" name="phone" {...bind('phone')} type="tel" className={s.widgetInput} autoComplete="tel" maxLength={40} />
              <span className={s.askNote}>Email or phone, whichever you&rsquo;d like the answer on.</span>
            </div>

            {state.error && (
              <p className={s.askError} role="alert">
                {state.error}
              </p>
            )}

            <button type="submit" className={s.askSend} disabled={pending}>
              {pending ? 'Sending…' : 'Send my question'}
            </button>
          </form>
        ))}
    </div>
  );
}
