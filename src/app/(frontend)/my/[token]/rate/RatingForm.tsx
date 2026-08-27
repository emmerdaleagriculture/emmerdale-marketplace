'use client';

import { useActionState, useState } from 'react';
import { submitRatingAction } from '../actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';
import s from './rate.module.css';

const EMPTY: FormState = {};

export function RatingForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(submitRatingAction, EMPTY);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);

  if (state.ok) {
    return (
      <div className={a.card}>
        <p className={f.success} style={{ fontSize: 16, margin: 0 }}>
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className={a.card}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="stars" value={stars || ''} />

      <div className={s.starRow} role="radiogroup" aria-label="Rating out of five">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className={s.star}
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
          >
            {(hover || stars) >= n ? '★' : '☆'}
          </button>
        ))}
      </div>

      <label className={f.field}>
        <span className={f.label}>Anything to add? (optional)</span>
        <textarea className={f.textarea} name="comment" rows={3} maxLength={1000} />
      </label>

      <div className={a.actions}>
        <button className={f.btnYellow} type="submit" disabled={pending || stars === 0}>
          {pending ? 'Sending…' : 'Send rating'}
        </button>
      </div>
    </form>
  );
}
