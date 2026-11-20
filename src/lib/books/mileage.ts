/**
 * Mileage claims for a personal car or van (HMRC approved mileage allowance
 * payments, from 6 April 2026): 55p a mile for the first 10,000 business
 * miles a driver claims in a tax year, 25p after that. No VAT. Posts
 * Dr 6330 Mileage allowance, Cr the owner's account (director's loan for a
 * company, capital introduced otherwise) or another chosen account.
 * https://www.gov.uk/government/publications/increase-to-approved-mileage-allowance-payments-amaps-and-self-employed-simplified-mileage-rates
 */

import { roundDiv } from './money';
import type { Posting } from './posting';

export const MILEAGE_HIGH_PENCE = 55;
export const MILEAGE_LOW_PENCE = 25;
export const MILEAGE_BAND_MILES = 10_000;

/** The UK tax year containing a date: 6 April to 5 April. */
export function taxYearOf(isoDate: string): { from: string; to: string } {
  const [y, m, d] = isoDate.split('-').map(Number);
  const startYear = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  return { from: `${startYear}-04-06`, to: `${startYear + 1}-04-05` };
}

/**
 * Split a claim across the two rates given the miles this driver has already
 * claimed this tax year. Miles may have one decimal place; pence round half-up.
 */
export function mileageAmount(miles: number, alreadyClaimed: number): { pence: number; highMiles: number; lowMiles: number } {
  const tenths = Math.round(miles * 10);
  const doneTenths = Math.round(Math.max(0, alreadyClaimed) * 10);
  const bandLeft = Math.max(0, MILEAGE_BAND_MILES * 10 - doneTenths);
  const highTenths = Math.min(tenths, bandLeft);
  const lowTenths = tenths - highTenths;
  const pence = roundDiv(highTenths * MILEAGE_HIGH_PENCE + lowTenths * MILEAGE_LOW_PENCE, 10);
  return { pence, highMiles: highTenths / 10, lowMiles: lowTenths / 10 };
}

/** Parse an odometer reading as typed: commas and spaces allowed, up to one decimal place. */
export function parseOdometer(raw: string): number | null {
  const t = raw.replace(/[,\s]/g, '');
  if (!/^\d{1,7}(\.\d)?$/.test(t)) return null;
  return Number(t);
}

/** Miles between two odometer readings, or null unless finish is past start. */
export function milesFromOdometer(start: string, finish: string): number | null {
  const a = parseOdometer(start);
  const b = parseOdometer(finish);
  if (a === null || b === null || b <= a) return null;
  return Math.round((b - a) * 10) / 10;
}

export type MileageClaim = {
  date: string;
  driver: string;
  miles: number;
  journey: string;
  purpose: string;
  payCode: string;
  /** Odometer readings, when the driver gave them. */
  odometer?: { start: number; finish: number } | null;
};

const fmtMiles = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 1 });

export function buildMileagePosting(c: MileageClaim, alreadyClaimed: number): Posting {
  const { pence, highMiles, lowMiles } = mileageAmount(c.miles, alreadyClaimed);
  const rates =
    lowMiles === 0
      ? `at ${MILEAGE_HIGH_PENCE}p/mile`
      : highMiles === 0
        ? `at ${MILEAGE_LOW_PENCE}p/mile (over ${fmtMiles(MILEAGE_BAND_MILES)} this tax year)`
        : `(${fmtMiles(highMiles)} at ${MILEAGE_HIGH_PENCE}p, ${fmtMiles(lowMiles)} at ${MILEAGE_LOW_PENCE}p)`;
  const odo = c.odometer ? `odometer ${fmtMiles(c.odometer.start)}–${fmtMiles(c.odometer.finish)}` : '';
  const detail = [c.journey.trim(), c.purpose.trim(), odo].filter(Boolean).join(' · ');
  return {
    entry: {
      entry_date: c.date,
      kind: 'purchase',
      source: 'mileage',
      counterparty: c.driver.trim() || null,
      reference: null,
      description: `Mileage: ${fmtMiles(c.miles)} miles ${rates}${detail ? ` (${detail})` : ''}`,
      vat_code: 'OUTSIDE',
      net_pence: pence,
      vat_pence: 0,
      gross_pence: pence,
      is_capital: false,
      meta: {
        miles: c.miles,
        driver: c.driver.trim(),
        journey: c.journey.trim(),
        purpose: c.purpose.trim(),
        ...(c.odometer ? { odometer_start: c.odometer.start, odometer_finish: c.odometer.finish } : {}),
        high_miles: highMiles,
        low_miles: lowMiles,
      },
    },
    lines: [
      { code: '6330', debit: pence, credit: 0 },
      { code: c.payCode, debit: 0, credit: pence },
    ],
  };
}
