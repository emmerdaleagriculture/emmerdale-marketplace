'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCoverageRunAction } from '../actions';
import css from '../coverage.module.css';

export function DeleteRun({ id, linked }: { id: string; linked: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className={css.controls}>
      {asking ? (
        <>
          <button
            type="button"
            className={css.danger}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteCoverageRunAction(id);
                if (res.ok) router.push('/info/coverage-map');
                else setError(res.error ?? 'That didn’t delete.');
              })
            }
          >
            {pending ? 'Deleting…' : 'Yes, delete the map'}
          </button>
          <button type="button" className={css.ghost} onClick={() => setAsking(false)}>
            Keep it
          </button>
        </>
      ) : (
        <button type="button" className={css.ghost} onClick={() => setAsking(true)}>
          Delete this run
        </button>
      )}
      {asking && linked > 0 && (
        <p className={css.hint}>The {linked === 1 ? 'spray record stays' : `${linked} spray records stay`} in your diary; only the map goes.</p>
      )}
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
