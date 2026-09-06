import { cookies } from 'next/headers';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';

/**
 * The job a customer has just sent, remembered for the walk from the
 * thank-you page to an account.
 *
 * It has to be a cookie, not a query parameter. The client token is the key
 * to the whole job — contact details, prices, the payment link — and the Meta
 * pixel and GA tag both run site-wide, so anything in a URL is sent to
 * Facebook and Google as the page address. A token in the query string would
 * be handing out the job.
 *
 * Short-lived and httpOnly: it exists to carry one intent across two or three
 * pages, not to be a session.
 */
const NAME = 'ea_job';
const MAX_AGE = 2 * 60 * 60;

export async function rememberJustSentJob(clientToken: string): Promise<void> {
  (await cookies()).set(NAME, clientToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

/** The token, or null. Shape-checked, because a cookie is user-editable. */
export async function justSentJob(): Promise<string | null> {
  const value = (await cookies()).get(NAME)?.value;
  return value && isTokenFormat(value) ? value : null;
}

export async function forgetJustSentJob(): Promise<void> {
  (await cookies()).delete(NAME);
}
