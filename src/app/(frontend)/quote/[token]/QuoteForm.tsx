'use client';

import { useActionState, useState } from 'react';
import { submitQuoteAction, type QuoteActionState } from './actions';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';
import q from './quote.module.css';

const EMPTY: QuoteActionState = {};

export function QuoteForm({
  token,
  areaPriced,
  acres,
  revising,
  defaultValidUntil,
}: {
  token: string;
  areaPriced: boolean;
  acres: number | null;
  revising: boolean;
  defaultValidUntil: string | null;
}) {
  const [state, action, pending] = useActionState(submitQuoteAction, EMPTY);
  const [quoteType, setQuoteType] = useState<'total' | 'rate'>('total');

  if (state.closed) {
    return <div className={q.closedPanel}>{state.message}</div>;
  }
  if (state.ok) {
    return (
      <div className={a.card}>
        <p className={f.success} style={{ fontSize: 16, margin: 0 }}>
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className={a.card}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="quote_type" value={quoteType} />

      <div className={a.groupTitle}>{revising ? 'Send a new price' : 'Your price'}</div>

      {areaPriced && (
        <div className={f.chips} style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={quoteType === 'total' ? `${f.chip} ${f.chipOn}` : f.chip}
            onClick={() => setQuoteType('total')}
          >
            Total price
          </button>
          <button
            type="button"
            className={quoteType === 'rate' ? `${f.chip} ${f.chipOn}` : f.chip}
            onClick={() => setQuoteType('rate')}
          >
            £ per acre + minimum
          </button>
        </div>
      )}

      {quoteType === 'total' ? (
        <label className={f.field}>
          <span className={f.label}>Total price (£)</span>
          <input
            className={f.input}
            type="text"
            name="price"
            inputMode="decimal"
            placeholder="e.g. 450"
            required
          />
        </label>
      ) : (
        <div className={a.row2}>
          <label className={f.field}>
            <span className={f.label}>Rate per acre (£)</span>
            <input
              className={f.input}
              type="text"
              name="rate_value"
              inputMode="decimal"
              placeholder="e.g. 90"
              required
            />
            {acres !== null && (
              <span className={f.hint}>The job measures about {acres} acres.</span>
            )}
          </label>
          <label className={f.field}>
            <span className={f.label}>Minimum charge (£, optional)</span>
            <input
              className={f.input}
              type="text"
              name="rate_minimum"
              inputMode="decimal"
              placeholder="e.g. 250"
            />
          </label>
        </div>
      )}

      <label className={f.field}>
        <span className={f.label}>Notes to Emmerdale (optional — not shown to the customer)</span>
        <textarea className={f.textarea} name="notes" rows={2} maxLength={1000} />
      </label>

      <label className={f.checkRow}>
        <input type="checkbox" name="site_visit" />
        <span>I&rsquo;d need to see the site before confirming this price</span>
      </label>

      <label className={f.field}>
        <span className={f.label}>Price valid until</span>
        <input
          className={f.input}
          type="date"
          name="valid_until"
          defaultValue={defaultValidUntil ?? undefined}
          max={defaultValidUntil ?? undefined}
        />
        <span className={f.hint}>Your price drops out of the customer&rsquo;s list after this date.</span>
      </label>

      <div className={a.actions}>
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Sending…' : revising ? 'Send new price' : 'Send my price'}
        </button>
      </div>
    </form>
  );
}
