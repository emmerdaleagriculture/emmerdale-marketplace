'use server';

import { revalidatePath } from 'next/cache';
import { requireBooksWriter } from '@/lib/books/server';
import { inviteViewer, resendInvite, revokeViewer } from '@/lib/books/viewers.server';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

async function ownerEmail(): Promise<string | null> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  return user?.email ?? null;
}

export async function inviteViewerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const r = await inviteViewer(gate.ledger, await ownerEmail(), formData.get('email'), formData.get('name'));
  if (!r.ok) return { error: r.error };
  revalidatePath('/account/books/settings');
  return {
    ok: true,
    message: r.sent
      ? `Invitation sent to ${r.email}.`
      : `${r.email} has been added, but the email didn’t go. Use Resend below to try again.`,
  };
}

export async function viewerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireBooksWriter();
  if (!gate.ok) return { error: gate.error };
  if (!gate.ledger) return { error: 'Set up your books first.' };
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id) || id <= 0) return { error: 'Something went wrong. Please refresh and try again.' };
  if (formData.get('op') === 'remove') {
    const ok = await revokeViewer(gate.ledger.id, id);
    revalidatePath('/account/books/settings');
    return ok ? { ok: true, message: 'Removed. They can no longer see your books.' } : { error: 'That person was already removed.' };
  }
  const sent = await resendInvite(gate.ledger, await ownerEmail(), id);
  return sent ? { ok: true, message: 'Invitation sent again.' } : { error: 'The email didn’t go. Please try again.' };
}
