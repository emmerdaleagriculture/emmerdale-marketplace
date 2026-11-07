'use client';

import { useEffect, useState } from 'react';
import s from './quote.module.css';

/**
 * The invitation's two answers, fixed at the foot of the screen in the app
 * (PRD task 9): Pass, or Price this job. Each scrolls to the matching form
 * further down, so the forms stay the website's own.
 *
 * The bar steps aside from the price form down. Left in place it sat
 * over the price keypad and the form's own Send button, and a second tap on
 * "Price this job" (the obvious thing to do after typing a price) only
 * scrolled back to the top of the form, so contractors reported both
 * buttons as broken (2026-11-07).
 */
export function InviteActions({ canPass }: { canPass: boolean }) {
  const [formOnScreen, setFormOnScreen] = useState(false);

  // Hidden from the price form down: the pass form and the message thread
  // sit below it, and the bar has nothing to offer there except covering
  // their buttons. The price form comes first on the page (#pass follows
  // it, and is absent once priced), so it alone marks the line.
  //
  // A scroll check, not an IntersectionObserver: an observer only reports
  // crossings, so a jump from below the forms straight back to the top
  // (never intersecting either way) left the bar hidden.
  useEffect(() => {
    const price = document.getElementById('price');
    if (!price) return;
    let frame = 0;
    // Reached once the form's top is in the upper 60% of the screen: a form
    // only peeking in under the bar should not make it vanish early.
    const check = () => {
      frame = 0;
      setFormOnScreen(price.getBoundingClientRect().top < window.innerHeight * 0.6);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const go = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div
      className={`appFooterCta ${s.inviteActions} ${formOnScreen ? s.inviteActionsAway : ''}`}
      data-app-only
      aria-hidden={formOnScreen || undefined}
    >
      {canPass && (
        <button type="button" className={s.passBtn} onClick={go('pass')} tabIndex={formOnScreen ? -1 : undefined}>
          Pass
        </button>
      )}
      <button type="button" className={s.priceBtn} onClick={go('price')} tabIndex={formOnScreen ? -1 : undefined}>
        Price this job
      </button>
    </div>
  );
}
