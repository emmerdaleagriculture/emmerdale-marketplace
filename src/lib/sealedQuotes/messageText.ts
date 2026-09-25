import { DOMAIN, EMAIL, LINK, MONEY, hasPhoneNumber } from './clientNote';

/**
 * A message between a customer and a contractor, checked before it is stored.
 *
 * Same reasoning as the quote note (clientNote.ts), applied to a thread:
 *
 * - **Before award, no way to reach each other**, in either direction. The
 *   contractor is "Contractor B" and the customer is a postcode district
 *   until the deposit is paid; a phone number in a message walks round both,
 *   and round clause 8 of the contractor terms and 5.5 of the customer terms.
 * - **Never a contractor's own figure**, before or after award. The customer
 *   sees our price, not theirs, so "£400 all in" hands them the margin — and
 *   after award an "extra £50 for the bank" is extra work agreed off the
 *   books. The customer may mention money; it tells the contractor nothing
 *   about ours.
 *
 * After award contact details are fine: the contractor already has the
 * customer's, and the customer is welcome to theirs.
 *
 * Refused, not stripped, for the same reason as the note: someone who thinks
 * the other side read words they never saw is worse off than someone asked to
 * reword.
 */

export const MESSAGE_MAX = 2000;

export type MessageSender = 'client' | 'contractor';
export type ThreadState = 'pre_award' | 'post_award' | 'closed';

/** null when the message can be sent, otherwise the sentence to show. */
export function messageProblem(
  body: string,
  sender: MessageSender,
  state: ThreadState,
): string | null {
  const t = body.trim();
  if (!t) return 'Write a message first.';
  if (t.length > MESSAGE_MAX) {
    return `That message is too long — keep it under ${MESSAGE_MAX} characters.`;
  }
  if (state === 'pre_award') {
    if (LINK.test(t) || DOMAIN.test(t) || EMAIL.test(t)) {
      return sender === 'contractor'
        ? 'Please take the link or email address out — the customer deals with us until they accept a price.'
        : 'Please take the link or email address out — contractors get your details once you accept a price.';
    }
    if (hasPhoneNumber(t)) {
      return sender === 'contractor'
        ? 'Please take the phone number out — we pass your details on once the customer accepts your price.'
        : 'Please take the phone number out — the contractor you book gets it once you accept their price.';
    }
  }
  if (sender === 'contractor' && MONEY.test(t)) {
    return state === 'pre_award'
      ? 'Please leave amounts out — the customer sees our price, not yours. Put a figure in the price box instead.'
      : 'Please leave amounts out — the customer’s price is fixed and includes our fee. If the job has changed and the price should too, get in touch with us.';
  }
  return null;
}

/**
 * What gets checked and stored: trimmed, with CRLF folded to LF. Browsers
 * submit textarea line breaks as CRLF but count them as one character
 * against maxLength, so without this a message the box accepted could fail
 * the length check.
 */
export function normaliseMessage(body: string): string {
  return body.replace(/\r\n?/g, '\n').trim();
}

/** The sentence for each refusal sq_post_message can return. */
export function postRefusal(reason: string | undefined): string {
  switch (reason) {
    case 'closed':
      return 'This conversation has closed — the job has moved on.';
    case 'too_many':
      return 'That’s a lot of messages in an hour — please wait a little before sending more.';
    case 'state_changed':
      return 'The job has just changed — please check your message still fits and send it again.';
    case 'no_thread':
      return 'You can message a contractor once they’ve sent a price or a question.';
    default:
      return 'That didn’t send — please try again.';
  }
}
