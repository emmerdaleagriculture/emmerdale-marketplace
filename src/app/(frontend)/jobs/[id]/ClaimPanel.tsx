'use client';

import { useActionState } from 'react';
import { claimJobAction } from './actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import j from '../jobs.module.css';

/**
 * First-come-first-served claim. One button — the first contractor to claim
 * wins the job outright and gets the customer's contact. Paid members see this
 * during the exclusive head-start window; everyone else once the job is open.
 */
export function ClaimPanel({ jobId, isExclusive }: { jobId: string; isExclusive: boolean }) {
  const [state, action, pending] = useActionState(claimJobAction, emptyFormState);

  return (
    <div className={j.panel}>
      <div className={j.panelTitle}>{isExclusive ? 'Paid early access' : 'Claim this job'}</div>
      <p className={f.hint} style={{ marginBottom: 12 }}>
        {isExclusive
          ? 'You’re seeing this before the free tier. First to claim it gets the job and the customer’s details.'
          : 'First come, first served. Claim it and the customer’s details are yours to arrange the work directly — you invoice them, we take no cut.'}
      </p>
      <form action={action}>
        {state.error && <p className={f.error}>{state.error}</p>}
        <input type="hidden" name="job_id" value={jobId} />
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Claiming…' : 'Claim this job'}
        </button>
      </form>
    </div>
  );
}
