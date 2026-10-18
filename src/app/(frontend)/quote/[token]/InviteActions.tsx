'use client';

import s from './quote.module.css';

/**
 * The invitation's two answers, fixed at the foot of the screen in the app
 * (PRD task 9): Pass, or Price this job. Each scrolls to the matching form
 * further down, so the forms stay the website's own.
 */
export function InviteActions({ canPass }: { canPass: boolean }) {
  const go = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className={`appFooterCta ${s.inviteActions}`} data-app-only>
      {canPass && (
        <button type="button" className={s.passBtn} onClick={go('pass')}>
          Pass
        </button>
      )}
      <button type="button" className={s.priceBtn} onClick={go('price')}>
        Price this job
      </button>
    </div>
  );
}
