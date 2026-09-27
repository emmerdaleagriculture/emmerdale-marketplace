import s from './start.module.css';

/**
 * Shared by the ad landing pages (/start, /paddock-care): the trust chips
 * above the form, and everything below it — what happens after sending, and
 * how to reach a person.
 */
export const TRUST = ['Prices upfront', 'Vetted contractors', 'Every job insured', 'Pay online'];

const AFTER_STEPS: [string, string][] = [
  ['You tell us what needs doing', 'In your own words. Takes about a minute — no account needed.'],
  [
    'We ask contractors who cover your area',
    'Approved operators we’ve vetted, with the work covered by our own insurance. They price your job directly — your contact details stay with us until you accept a price.',
  ],
  [
    'You see their prices side by side',
    'With how far away they are. Message any contractor who’s priced with a question before you accept, then pick the one you want.',
  ],
  [
    'You book the one you choose',
    'Pay securely online — a 15% deposit to book, and the rest once the work is done.',
  ],
  [
    'The work gets done',
    'Before and after photos land on your job page. You confirm you’re happy.',
  ],
];

export function LandingAfter() {
  return (
    <>
      {/* What happens next, for the arrival who scrolls past the box
          instead of typing in it. Strictly below the form: everything
          above the card is paid for in fold pixels on a phone, and this
          is read by someone already deciding, not someone arriving. */}
      <section className={s.after} aria-labelledby="after-title">
        <h2 id="after-title" className={s.afterTitle}>
          What happens after you send this
        </h2>
        <p className={s.afterSub}>
          No phone calls out of the blue, and nothing to pay to find out the price.
        </p>
        <ol className={s.steps}>
          {AFTER_STEPS.map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{body}</span>
            </li>
          ))}
        </ol>
        <p className={s.notLeadGen}>
          <strong>We&rsquo;re not a lead-generation site.</strong> Your number
          doesn&rsquo;t get passed round a list of contractors. You deal with
          us, and you choose who does the work.
        </p>
      </section>
      {/* Outside <LandingFlow> on purpose: it renders one of three things
          depending on where the customer is, and the way to reach a human
          should not depend on which. */}
      <p className={s.contact}>
        If you need to contact us directly, email{' '}
        <a href="mailto:tom@emmerdaleagriculture.com">tom@emmerdaleagriculture.com</a>.
      </p>
    </>
  );
}
