import { CONTACT_EMAIL } from '@/lib/site';
import s from './ContactUsButton.module.css';

/**
 * "Contact us" for signed-in customers and contractors: opens an email to us
 * with the subject (and, where useful, a reference) already filled in, so the
 * message arrives saying who and what it's about.
 *
 * The address is printed beside the button too. A mailto is a dead end on a
 * phone with no mail app set up (see /contact) — the visible address still
 * lets them copy it into whatever they do use.
 */
export function ContactUsButton({
  subject,
  body,
  note = 'Questions, problems or anything else — a real person reads these.',
}: {
  subject: string;
  body?: string;
  note?: string;
}) {
  const params = new URLSearchParams({ subject });
  if (body) params.set('body', body);
  // URLSearchParams encodes spaces as "+", which mail clients show literally.
  const href = `mailto:${CONTACT_EMAIL}?${params.toString().replace(/\+/g, '%20')}`;

  return (
    <aside className={s.wrap} aria-label="Contact us">
      <a className={s.button} href={href}>
        Contact us
      </a>
      <p className={s.note}>
        {note} Or email{' '}
        <a className={s.address} href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </aside>
  );
}
