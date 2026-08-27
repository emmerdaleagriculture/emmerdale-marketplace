'use client';

import { useActionState, useState } from 'react';
import {
  cancelJobAction,
  classifyAndDistributeAction,
  distributeNowAction,
  markCompletedAction,
} from './distribution-actions';
import type { FormState } from '@/lib/form';
import type { ServiceOption } from '@/components/forms/ServicePicker';
import f from '@/components/forms/forms.module.css';
import s from '../../admin.module.css';

const EMPTY: FormState = {};

function ActionResult({ state }: { state: FormState }) {
  if (state.error) return <p className={f.error}>{state.error}</p>;
  if (state.ok) return <p className={f.success}>{state.message}</p>;
  return null;
}

/**
 * Operator controls (§29): every action needs a reason where it mutates, and
 * everything lands in job_events with actor_type 'operator'.
 */
export function DistributionPanel({
  submissionId,
  status,
  serviceId,
  services,
}: {
  submissionId: string;
  status: string;
  serviceId: number | null;
  services: ServiceOption[];
}) {
  const [classifyState, classify, classifying] = useActionState(classifyAndDistributeAction, EMPTY);
  const [distState, distribute, distributing] = useActionState(distributeNowAction, EMPTY);
  const [cancelState, cancel, cancelling] = useActionState(cancelJobAction, EMPTY);
  const [completeState, complete, completing] = useActionState(markCompletedAction, EMPTY);
  const [pickedService, setPickedService] = useState('');

  const cancellable = ['confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment'].includes(status);
  const completable = ['awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor'].includes(status);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {status === 'confirmed' && serviceId === null && (
        <form action={classify} className={s.actions} style={{ alignItems: 'center', gap: 10 }}>
          <ActionResult state={classifyState} />
          <input type="hidden" name="submission_id" value={submissionId} />
          <select
            className={f.input}
            name="service_id"
            value={pickedService}
            onChange={(e) => setPickedService(e.target.value)}
            style={{ maxWidth: 280 }}
          >
            <option value="">Classify as…</option>
            {services.map((sv) => (
              <option key={sv.id} value={sv.id}>
                {sv.name}
              </option>
            ))}
          </select>
          <button className={s.btnApprove} type="submit" disabled={classifying || !pickedService}>
            {classifying ? 'Sending…' : 'Classify & distribute'}
          </button>
        </form>
      )}

      {status === 'confirmed' && serviceId !== null && (
        <form action={distribute} className={s.actions}>
          <ActionResult state={distState} />
          <input type="hidden" name="submission_id" value={submissionId} />
          <button className={s.btnApprove} type="submit" disabled={distributing}>
            {distributing ? 'Sending…' : 'Distribute now'}
          </button>
        </form>
      )}

      {completable && (
        <form action={complete} className={s.actions} style={{ alignItems: 'center', gap: 10 }}>
          <ActionResult state={completeState} />
          <input type="hidden" name="submission_id" value={submissionId} />
          <input
            className={f.input}
            name="reason"
            placeholder="Reason (goes in the audit log)"
            style={{ maxWidth: 320 }}
            required
          />
          <button className={s.btnApprove} type="submit" disabled={completing}>
            {completing ? 'Marking…' : 'Mark work complete'}
          </button>
        </form>
      )}

      {cancellable && (
        <form action={cancel} className={s.actions} style={{ alignItems: 'center', gap: 10 }}>
          <ActionResult state={cancelState} />
          <input type="hidden" name="submission_id" value={submissionId} />
          <input
            className={f.input}
            name="reason"
            placeholder="Reason (goes in the audit log)"
            style={{ maxWidth: 320 }}
            required
          />
          <button className={s.btnSuspend} type="submit" disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel job'}
          </button>
        </form>
      )}
    </div>
  );
}
