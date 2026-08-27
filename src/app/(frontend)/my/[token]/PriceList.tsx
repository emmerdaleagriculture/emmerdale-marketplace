'use client';

import { useActionState, useState } from 'react';
import { acceptQuoteAction, type AcceptActionState } from './actions';
import { formatGBP, formatRate } from '@/lib/sealedQuotes/money';
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
  contractor_display_label: string;
  contractor_rating_avg: number | null;
  contractor_rating_count: number;
  distance_miles: number | null;
  site_visit_required: boolean;
  valid_until: string;
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
}: {
  token: string;
  quotes: ClientQuoteView[];
  ratingWeight: number;
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
              <span className={m.quotePrice}>{formatGBP(q.client_price_pence)}</span>
            </div>
            <div className={m.quoteMeta}>
              <RatingStars avg={q.contractor_rating_avg} count={q.contractor_rating_count} />
              {q.distance_miles != null && <span>{q.distance_miles} miles away</span>}
              {q.client_rate_value_pence != null && (
                <span>{formatRate(q.client_rate_value_pence, q.client_rate_minimum_pence)}</span>
              )}
              {q.site_visit_required && <span>Wants to see the site first</span>}
              <span>valid until {q.valid_until}</span>
            </div>
            {confirming === q.id ? (
              <form action={action} className={m.acceptConfirm}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="client_quote_id" value={q.id} />
                <p>
                  You&rsquo;re accepting <strong>{q.contractor_display_label}</strong> at{' '}
                  <strong>{formatGBP(q.client_price_pence)}</strong>. You pay Emmerdale up
                  front; the money is only released to the contractor when the
                  work&rsquo;s done.
                </p>
                <div className={m.acceptButtons}>
                  <button className={f.btnYellow} type="submit" disabled={pending}>
                    {pending ? 'Setting up payment…' : 'Accept and pay'}
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
              <button
                type="button"
                className={f.btnPrimary}
                onClick={() => setConfirming(q.id)}
              >
                Accept this price
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
