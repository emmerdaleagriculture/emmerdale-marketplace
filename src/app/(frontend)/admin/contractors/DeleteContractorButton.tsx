'use client';

import { deleteContractor } from './actions';
import s from '../admin.module.css';

/**
 * Delete/reject a contractor with a confirm() guard. "Reject" for a pending
 * applicant, "Delete" for an existing contractor — same destructive action
 * (removes the auth user and cascades), just labelled for the case.
 */
export function DeleteContractorButton({
  id,
  business,
  pending,
}: {
  id: string;
  business: string;
  pending: boolean;
}) {
  const label = pending ? 'Reject' : 'Delete';
  const confirmText = pending
    ? `Reject and permanently remove the application from ${business}? This cannot be undone.`
    : `Permanently delete ${business}? This removes their account and county coverage and cannot be undone.`;

  return (
    <form
      action={deleteContractor}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={s.btnSuspend}>
        {label}
      </button>
    </form>
  );
}
