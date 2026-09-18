'use client';

import { useState } from 'react';
import { formatGBP } from '@/lib/sealedQuotes/money';
import type { RecentWorkRow } from '@/lib/home/recentWork';
import s from './home.module.css';

// window.gtag is declared once, in @/components/Analytics.

/**
 * The board itself. Client-side only because of the filter chips — the rows
 * are already loaded, so filtering is a local array filter rather than a
 * round trip.
 *
 * Chips come from the services present in the data, not from HOME_SERVICES:
 * the two taxonomies disagree (the services table has `Flailing` and `Flail
 * collecting`, neither of which has a card), so chips built from the card list
 * would quietly hide real jobs.
 */
export function RecentWorkBoard({
  rows,
  filters,
}: {
  rows: RecentWorkRow[];
  filters: string[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const shown = active ? rows.filter((r) => r.service_name === active) : rows;

  const pick = (name: string | null) => {
    setActive(name);
    // What people filter to is what they're shopping for — the whole reason
    // the chips are worth having.
    if (name) window.gtag?.('event', 'filter_recent_work', { service: name });
  };

  return (
    <>
      {filters.length > 1 ? (
        <div className={s.workChips} role="group" aria-label="Filter by service">
          <button
            type="button"
            onClick={() => pick(null)}
            aria-pressed={active === null}
            className={`${s.workChip} ${active === null ? s.workChipOn : ''}`}
          >
            All
          </button>
          {filters.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => pick(name)}
              aria-pressed={active === name}
              className={`${s.workChip} ${active === name ? s.workChipOn : ''}`}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      <ul className={s.workGrid}>
        {shown.map((r, i) => (
          <li key={`${r.service_name}-${r.amount_pence}-${i}`} className={s.workCard}>
            <span className={s.workService}>{r.service_name}</span>
            <span className={s.workPrice}>{formatGBP(r.amount_pence)}</span>
            {/* Only ever rendered on a job that carries a real rating. No
                default, no average, no placeholder — a star on an unrated job
                is a fake review, and that is a legal line rather than a
                stylistic one. */}
            {r.stars !== null ? (
              <span className={s.workStars} aria-label={`Rated ${r.stars} out of 5`}>
                {'★'.repeat(r.stars)}
                <span aria-hidden="true" className={s.workStarsOff}>
                  {'★'.repeat(Math.max(0, 5 - r.stars))}
                </span>
              </span>
            ) : null}
            {/* Tom's two businesses are at arm's length, so HPM work is
                labelled rather than presented as an Emmerdale booking. */}
            {r.source === 'hpm' ? (
              <span className={s.workSource}>Hampshire Paddock Management</span>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
