'use client';

import { useState } from 'react';
import { computeClientPricePence, formatGBP } from '@/lib/sealedQuotes/money';
import ui from '@/app/(frontend)/app/app-ui.module.css';
import s from './keypad.module.css';

/** The customer's figure for a contractor price: computeClientPricePence, the TS twin of SQL client_price_pence. */
export function customerPaysPence(contractorPence: number, rate: number): number {
  return computeClientPricePence(contractorPence, rate);
}

/**
 * The app's price entry (PRD task 9): a big figure, a keypad, and what it
 * means — what the customer pays, our fee at the job's stored rate, what
 * the contractor receives. Writes the figure
 * into the form's `price` field, so the submit is the website's own.
 */
export function PriceKeypad({
  rate,
  premium,
  premiumRate,
  summary,
  onChange,
}: {
  rate: number;
  premium: boolean;
  premiumRate: number;
  summary: string;
  onChange: (pounds: string) => void;
}) {
  const [digits, setDigits] = useState('');
  const pounds = Number(digits || 0);
  const pence = pounds * 100;
  const customer = pence ? customerPaysPence(pence, rate) : 0;
  const fee = customer - pence;
  // No membership pitch in the app (store rules; plans live on the website
  // only, the Spotify way). Kept null so the layout below is unchanged.
  const withPremium: number | null = null;
  void premium; void premiumRate;

  const tap = (d: string) => {
    const next = d === '⌫' ? digits.slice(0, -1) : (digits + d).replace(/^0+(?=\d)/, '').slice(0, 6);
    setDigits(next);
    onChange(next);
  };

  return (
    <div className={s.wrap}>
      <p className={s.summary}>{summary}</p>
      <div className={s.figure} aria-live="polite">
        <span className={s.pound}>£</span>
        {digits || '0'}
      </div>
      <p className={s.sub}>
        Your price, before VAT.
      </p>
      <div className={ui.card} style={{ marginBottom: 12 }}>
        <div className={s.line}><span>Customer pays</span><span>{customer ? formatGBP(customer) : '—'}</span></div>
        <div className={s.line}><span>Emmerdale fee ({Math.round(rate * 100)}%)</span><span>{customer ? `−${formatGBP(fee)}` : '—'}</span></div>
        <div className={`${s.line} ${s.total}`}><span>You receive</span><span>{pence ? formatGBP(pence) : '—'}</span></div>
      </div>
      {withPremium != null && (
        <p className={s.sub}>With Premium the customer would see {formatGBP(withPremium)} instead, for the same {formatGBP(pence)} to you.</p>
      )}
      <div className={s.keys}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
          <button key={i} type="button" className={s.key} onClick={() => k && tap(k)} disabled={!k} aria-label={k === '⌫' ? 'Delete' : k}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
