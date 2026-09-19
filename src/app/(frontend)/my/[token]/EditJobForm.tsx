'use client';

import { useActionState, useState } from 'react';
import { editJobAction } from '../actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
// The button row: forms.module.css has no .actions, and this is the same
// module ConfirmStep uses for exactly this row.
import a from '@/app/(frontend)/auth.module.css';

/**
 * Correcting a job after it has been sent.
 *
 * Folded away behind a button rather than shown open: almost nobody needs it,
 * and a page that opens on a form invites people to re-describe a job that was
 * already right. The ones who do need it arrived here from an email asking
 * where to change something, so the button only has to be findable, not loud.
 *
 * Deliberately NOT inside JobSpecCard, which renders identically on the
 * contractor price page and the won-job view — an edit control in there would
 * follow the card onto pages it has no business being on.
 */

const UNIT_LABELS: [string, string][] = [
  ['acres', 'Acres'],
  ['hectares', 'Hectares'],
  ['sq_m', 'Square metres'],
  ['linear_m', 'Metres (length)'],
];

// Local rather than imported from JobSpecCard: that module is rendered on the
// server everywhere else, and pulling it in here would drag it into the client
// bundle for four strings.
const URGENCY_OPTIONS: [string, string][] = [
  ['asap', 'As soon as possible'],
  ['within_month', 'Within the month'],
  ['flexible', 'Flexible'],
  ['dated', 'By a specific date'],
];

export type EditableJob = {
  description: string | null;
  areaValue: number | null;
  areaUnit: string | null;
  urgency: string | null;
  targetDate: string | null;
  accessNotes: string | null;
  obstacles: string | null;
};

export function EditJobForm({ token, initial }: { token: string; initial: EditableJob }) {
  const [open, setOpen] = useState(false);
  const [dated, setDated] = useState(initial.urgency === 'dated');
  const [state, action, pending] = useActionState(editJobAction, emptyFormState);

  // Once it has saved, the page behind this has been revalidated and now shows
  // the corrected job. Keeping the form open would invite a second edit of
  // values it is no longer displaying.
  if (state.ok) {
    return <p className={f.hint}>{state.message}</p>;
  }

  if (!open) {
    return (
      <p className={f.hint}>
        Something not right?{' '}
        <button type="button" className={f.linkButton} onClick={() => setOpen(true)}>
          Correct these details
        </button>
      </p>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />

      <label className={f.field}>
        <span className={f.label}>What needs doing</span>
        <textarea
          className={f.textarea}
          name="service_verbatim"
          rows={3}
          maxLength={2000}
          defaultValue={initial.description ?? ''}
        />
      </label>

      <label className={f.field}>
        <span className={f.label}>How big is it?</span>
        <input
          className={f.input}
          type="number"
          name="area_value"
          step="0.01"
          min="0"
          inputMode="decimal"
          defaultValue={initial.areaValue ?? ''}
        />
        <select className={f.input} name="area_unit" defaultValue={initial.areaUnit ?? 'acres'}>
          {UNIT_LABELS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className={f.field}>
        <span className={f.label}>When does it need doing?</span>
        <select
          className={f.input}
          name="urgency"
          defaultValue={initial.urgency ?? ''}
          onChange={(e) => setDated(e.target.value === 'dated')}
        >
          <option value="">Not stated</option>
          {URGENCY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {dated && (
        <label className={f.field}>
          <span className={f.label}>By what date?</span>
          <input
            className={f.input}
            type="date"
            name="target_date"
            defaultValue={initial.targetDate ?? ''}
          />
        </label>
      )}

      <label className={f.field}>
        <span className={f.label}>Getting in (optional)</span>
        <textarea
          className={f.textarea}
          name="access_notes"
          rows={2}
          maxLength={1000}
          defaultValue={initial.accessNotes ?? ''}
        />
      </label>

      <label className={f.field}>
        <span className={f.label}>Anything in the way? (optional)</span>
        <textarea
          className={f.textarea}
          name="obstacles"
          rows={2}
          maxLength={1000}
          defaultValue={initial.obstacles ?? ''}
        />
      </label>

      {/* Said before they save, not after: a customer who has had one price
          already should not discover from a confirmation message that it may
          now move. */}
      <p className={f.hint}>
        Any contractor who has already sent you a price will be told what changed.
        Their price still stands unless they choose to change it.
      </p>

      {state.error && <p className={f.error}>{state.error}</p>}

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
