'use client';

import { useEffect, useState } from 'react';
import s from './quote.module.css';

/**
 * The invitation's two answers, fixed at the foot of the screen in the app
 * (PRD task 9): Pass, or Price this job. Each scrolls to the matching form
 * further down, so the forms stay the website's own.
 *
 * The bar steps aside once either form is on screen. Left in place it sat
 * over the price keypad and the form's own Send button, and a second tap on
 * "Price this job" (the obvious thing to do after typing a price) only
 * scrolled back to the top of the form, so contractors reported both
 * buttons as broken (2026-11-07).
 */
export function InviteActions({ canPass }: { canPass: boolean }) {
  const [formOnScreen, setFormOnScreen] = useState(false);

  useEffect(() => {
    const targets = ['price', 'pass']
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const showing = new Set<Element>();
    // The bottom 40% of the screen does not count: a form only peeking in
    // under the bar should not make it vanish before the contractor has
    // reached it.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) showing.add(e.target);
          else showing.delete(e.target);
        }
        setFormOnScreen(showing.size > 0);
      },
      { rootMargin: '0px 0px -40% 0px' },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
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
