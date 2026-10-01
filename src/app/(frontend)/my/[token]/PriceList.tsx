'use client';

import { useActionState, useState } from 'react';
import { acceptQuoteAction, type AcceptActionState } from './actions';
import { depositSplitPence, formatGBP, formatRate, formatUnitPrice, vatNote } from '@/lib/sealedQuotes/money';
import { sortClientQuotes, type SortMode } from '@/lib/sealedQuotes/quoteSort';
import { RatingStars } from '@/components/RatingStars';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: AcceptActionState = {};

export type ClientQuoteView = {
  id: string;
  client_price_pence: number;
  client_rate_value_pence: number | null;
  client_rate_minimum_pence: number | null;
  price_basis: string;
  contractor_display_label: string;
  contractor_rating_avg: number | null;
  contractor_rating_count: number;
  distance_miles: number | null;
  site_visit_required: boolean;
  valid_until: string;
  /** Set on a unit-priced quote: "£12 per bale × 20". */
  unit_label: string | null;
  unit_quantity: number | null;
  /** The contractor's own words, in their voice. May be null. */
  contractor_note: string | null;
};

const SORT_LABELS: [SortMode, string][] = [
  ['recommended', 'Recommended'],
  ['price', 'Lowest price'],
  ['rating', 'Highest rated'],
];

/**
 * The live price list (§18): masked labels until award, all prices received,
 * no hint of how many contractors stayed silent. Sorting is option C — a
 * composite default with a visible, client-controlled toggle.
 */
export function PriceList({
  token,
  quotes,
  ratingWeight,
  depositRate,
  visitThreads,
}: {
  token: string;
  quotes: ClientQuoteView[];
  ratingWeight: number;
  /** 1 = the deposit is the whole price, and the split is never mentioned. */
  depositRate: number;
  /**
   * Contractor label → the thread where a site visit can be suggested
   * (20261001120000_thread_visits). Absent when it can't be, there: the
   * conversation is moderated, or closed.
   */
  visitThreads: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(acceptQuoteAction, EMPTY);
  const [mode, setMode] = useState<SortMode>('recommended');
  const [confirming, setConfirming] = useState<string | null>(null);

  const sorted = sortClientQuotes(quotes, mode, { ratingWeight });

  return (
    <div>
      {state.error && <p className={f.error}>{state.error}</p>}

      <div className={f.chips} style={{ marginBottom: 14 }}>
        {SORT_LABELS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={mode === value ? `${f.chip} ${f.chipOn}` : f.chip}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={m.quoteList}>
        {sorted.map((q) => (
          <div key={q.id} className={m.quoteCard}>
            <div className={m.quoteHead}>
              <span className={m.quoteLabel}>{q.contractor_display_label}</span>
              <span className={m.quotePriceWrap}>
                <span className={m.quotePrice}>{formatGBP(q.client_price_pence)}</span>
                {vatNote(q.price_basis) && (
                  <span className={m.vatNote}>{vatNote(q.price_basis)}</span>
                )}
              </span>
            </div>
            <div className={m.quoteMeta}>
              <RatingStars avg={q.contractor_rating_avg} count={q.contractor_rating_count} />
              {q.distance_miles != null && <span>{q.distance_miles} miles away</span>}
              {q.client_rate_value_pence != null &&
                (q.unit_label && q.unit_quantity != null ? (
                  <span>
                    {formatUnitPrice(q.client_rate_value_pence, q.unit_label, Number(q.unit_quantity))}
                  </span>
                ) : (
                  <span>{formatRate(q.client_rate_value_pence, q.client_rate_minimum_pence)}</span>
                ))}
              {q.site_visit_required && <span>Wants to see the site first</span>}
              <span>valid until {q.valid_until}</span>
            </div>
            {/* The contractor's own words. Quoted, so it reads as theirs and
                not as something we are saying about the price. */}
            {q.contractor_note && (
              <p className={m.quoteNote}>&ldquo;{q.contractor_note}&rdquo;</p>
            )}
            {confirming === q.id ? (
              <form action={action} className={m.acceptConfirm}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="client_quote_id" value={q.id} />
                {(() => {
                  const { deposit, balance } = depositSplitPence(
                    q.client_price_pence,
                    depositRate,
                  );
                  const note = vatNote(q.price_basis);
                  // Booking with a site visit: the same deposit, but the price
                  // is confirmed on the ground and the customer is protected
                  // if it changes (20260930160000_site_visit_booking).
                  if (q.site_visit_required) {
                    return (
                      <p>
                        You&rsquo;re booking <strong>{q.contractor_display_label}</strong> at{' '}
                        <strong>{formatGBP(q.client_price_pence)}</strong>
                        {note ? ` (${note})` : ''}, subject to a site visit. You pay{' '}
                        <strong>{formatGBP(deposit)}</strong> now, and they get your details to
                        arrange the visit. If they change the price afterwards, you can accept the
                        new one or decline it and have the {formatGBP(deposit)} back in full.
                      </p>
                    );
                  }
                  return balance > 0 ? (
                    <p>
                      You&rsquo;re accepting <strong>{q.contractor_display_label}</strong> at{' '}
                      <strong>{formatGBP(q.client_price_pence)}</strong>
                      {note ? ` (${note})` : ''}. You pay{' '}
                      <strong>{formatGBP(deposit)}</strong> now to book it; the remaining{' '}
                      {formatGBP(balance)} is charged to the same card once the work is done
                      and you&rsquo;ve confirmed it.
                    </p>
                  ) : (
                    <p>
                      You&rsquo;re accepting <strong>{q.contractor_display_label}</strong> at{' '}
                      <strong>{formatGBP(q.client_price_pence)}</strong>
                      {note ? ` (${note})` : ''}, paid now to book it.
                    </p>
                  );
                })()}
                <div className={m.acceptButtons}>
                  <button className={f.btnYellow} type="submit" disabled={pending}>
                    {pending
                      ? 'Setting up payment…'
                      : q.site_visit_required
                        ? 'Book the site visit'
                        : 'Accept and book'}
                  </button>
                  <button
                    type="button"
                    className={f.btnGhost}
                    onClick={() => setConfirming(null)}
                    disabled={pending}
                  >
                    Back
                  </button>
                </div>
              </form>
            ) : (
              <div className={m.acceptButtons}>
                {/* A look before any money: the visit is arranged in the
                    thread, and the deposit only comes with a booking. Where
                    the contractor has asked to see the site, that is the
                    main action and the deposit route the quieter one. */}
                {q.site_visit_required && visitThreads[q.contractor_display_label] ? (
                  <>
                    <a
                      className={f.btnPrimary}
                      href={`#visit-${visitThreads[q.contractor_display_label]}`}
                    >
                      Arrange a site visit — no deposit
                    </a>
                    <button type="button" className={f.btnGhost} onClick={() => setConfirming(q.id)}>
                      Book now, visit after
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={f.btnPrimary} onClick={() => setConfirming(q.id)}>
                      {q.site_visit_required ? 'Book a site visit' : 'Accept this price'}
                    </button>
                    {visitThreads[q.contractor_display_label] && (
                      <a className={f.btnGhost} href={`#visit-${visitThreads[q.contractor_display_label]}`}>
                        Arrange a visit first
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
