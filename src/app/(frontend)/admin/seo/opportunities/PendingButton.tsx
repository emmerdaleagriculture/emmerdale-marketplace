'use client';

import { useFormStatus } from 'react-dom';

/**
 * A submit button that says what it is doing while its form's action runs.
 * Writing an article takes a minute or two; without this the button looked
 * dead and invited a second click. Give it a form of its own: every button
 * in the form shares the one pending state.
 */
export function PendingButton({
  formAction,
  className,
  pendingLabel,
  children,
}: {
  formAction: (formData: FormData) => void | Promise<void>;
  className?: string;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" formAction={formAction} className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
