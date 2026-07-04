/** Standard return shape for server actions used with useActionState. */
export type FormState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export const emptyFormState: FormState = {};
