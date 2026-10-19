import q from './quote.module.css';

export type RevealedContact = {
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  postcode: string | null;
  gate_w3w: string | null;
};

/**
 * The customer's details, for an Open member (migration 20261019120000).
 * Shown above the price form on every live invitation they hold: the
 * membership exists so they can pick up the phone, so the number is a link
 * and the postcode opens directions. Pricing through us stays below it.
 */
export function CustomerContact({ contact }: { contact: RevealedContact }) {
  return (
    <div className={q.contactPanel} id="customer">
      <div className={q.contactHead}>
        <strong>The customer&rsquo;s details.</strong> As an Open member you can get in touch and
        agree the work with them directly, or send a price through us below at 5%.
      </div>
      <div className={q.contactGrid}>
        <div>
          <div className={q.contactLabel}>Name</div>
          <div>{contact.contact_name || '—'}</div>
        </div>
        <div>
          <div className={q.contactLabel}>Phone</div>
          <div>
            {contact.contact_phone ? (
              <a className={q.contactLink} href={`tel:${contact.contact_phone.replace(/\s+/g, '')}`}>
                {contact.contact_phone}
              </a>
            ) : (
              '—'
            )}
          </div>
        </div>
        <div>
          <div className={q.contactLabel}>Email</div>
          <div>
            {contact.contact_email ? (
              <a className={q.contactLink} href={`mailto:${contact.contact_email}`}>
                {contact.contact_email}
              </a>
            ) : (
              '—'
            )}
          </div>
        </div>
        <div>
          <div className={q.contactLabel}>Postcode</div>
          <div>
            {contact.postcode ? (
              <a
                className={q.contactLink}
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(contact.postcode)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {contact.postcode}
              </a>
            ) : (
              '—'
            )}
          </div>
        </div>
        {contact.gate_w3w && (
          <div>
            <div className={q.contactLabel}>Gate</div>
            <div>
              <a
                className={q.contactLink}
                href={`https://what3words.com/${contact.gate_w3w.replace(/^\/+/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >{`///${contact.gate_w3w.replace(/^\/+/, '')}`}</a>
            </div>
          </div>
        )}
      </div>
      <p className={q.contactNote}>
        Use these only for this job, and tell the customer you found them through us. Work you
        agree directly is between you and them: our cover, deposit and payment protection apply
        only to jobs booked through the site.
      </p>
    </div>
  );
}
