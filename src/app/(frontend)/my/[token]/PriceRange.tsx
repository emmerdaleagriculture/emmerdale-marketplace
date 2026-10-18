'use client';

import { formatGBP } from '@/lib/sealedQuotes/money';
import m from './my.module.css';

/**
 * The range bar above the price cards in the app (PRD task 8): lowest to
 * highest, a dot per price in between. Nothing the cards don't say; it is
 * the glance before the read. App mode only (data-app-only).
 */
export function PriceRange({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pos = (p: number) => (hi === lo ? 50 : ((p - lo) / (hi - lo)) * 100);
  return (
    <div className={m.range} data-app-only>
      <div className={m.rangeKicker}>Price range</div>
      <div className={m.rangeFigures}>
        {formatGBP(lo)} – {formatGBP(hi)}
      </div>
      <div className={m.rangeBar}>
        {prices.map((p, i) => (
          <span key={i} className={m.rangeDot} style={{ left: `${pos(p)}%` }} />
        ))}
      </div>
      <div className={m.rangeEnds}>
        <span>Lowest</span>
        <span>Highest</span>
      </div>
    </div>
  );
}
