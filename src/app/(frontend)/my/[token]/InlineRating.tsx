'use client';

import { useActionState, useState } from 'react';
import { submitRatingAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: FormState = {};

/**
 * Five stars, in the panel that just told them the job is done.
 *
 * The panel used to say "rate how it went" and link to a separate page. The
 * ask and the means to answer it were on two different screens, and a rating
 * takes about four seconds — nobody navigates for that. Same action, same
 * one-per-job rule, just put where the sentence is.
 */
export function InlineRating({ token }: { token: string }) {
  const [state, action, pending] = useActionState(submitRatingAction, EMPTY);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(false);

  if (state.ok) {
    return <p className={f.success}>{state.message}</p>;
  }

  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="stars" value={stars || ''} />

      <p className={m.ratePrompt}>How did it go?</p>
      <div className={m.starRow} role="radiogroup" aria-label="Rating out of five">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className={m.star}
            onClick={() => {
              setStars(n);
              setComment(true);
            }}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
          >
            {(hover || stars) >= n ? '★' : '☆'}
          </button>
        ))}
      </div>

      {/* The box only appears once they've picked, so the panel stays a
          one-tap ask for the people who only want to give it one tap. */}
      {comment && (
        <>
          <label className={f.field}>
            <span className={f.label}>Anything to add? (optional)</span>
            <textarea className={f.textarea} name="comment" rows={3} maxLength={1000} />
          </label>
          <button className={f.btnYellow} type="submit" disabled={pending}>
            {pending ? 'Sending…' : 'Send rating'}
          </button>
        </>
      )}
    </form>
  );
}
