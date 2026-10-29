'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TickerItem } from '@/app/api/jobs/ticker/route';
import styles from './JobTicker.module.css';

/**
 * The scrolling strip of latest jobs in the header, between the logo and the
 * burger: "Hedge cutting · Hampshire", "Topping · Devon", round and round.
 *
 * Fed by /api/jobs/ticker — the homepage's `jobs_in_progress` view, so it
 * carries a canonical service name and a county and nothing else. Fetched in
 * the browser after mount so every page wearing the header stays static; it
 * takes no room until there is something to show and the header's layout is
 * unchanged by its arrival (it fills the space the flex row already left).
 *
 * The motion is one CSS animation on a track holding the list repeated enough
 * times to cover the visible width plus one more copy, shifted by exactly one
 * copy's width so the loop joins seamlessly. Speed is constant — the duration
 * comes from the measured width, so eight short jobs and eight long ones scroll
 * at the same pace. Hover pauses it; prefers-reduced-motion stops it, leaving
 * the first few jobs standing still.
 */

/** Pixels per second. Slow enough to read, quick enough to notice. */
const SPEED = 36;

/** One copy's trailing gap, matching .list's padding-right in the CSS. */
const GAP = 36;

/**
 * One load per page, shared between the two headers: the customer header
 * swaps itself for the site header on hydration, and a second fetch for the
 * same eight rows would be silly.
 */
let feed: Promise<TickerItem[]> | null = null;
function loadFeed(): Promise<TickerItem[]> {
  if (!feed) {
    feed = fetch('/api/jobs/ticker')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: unknown }) => (Array.isArray(j.items) ? (j.items as TickerItem[]) : []))
      .catch(() => {
        feed = null;
        return [];
      });
  }
  return feed;
}

const List = forwardRef<HTMLUListElement, { items: TickerItem[]; hidden?: boolean }>(function List(
  { items, hidden },
  ref,
) {
  return (
    <ul className={styles.list} ref={ref} aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <li key={`${it.county}-${i}`} className={styles.item}>
          {it.service ? (
            <>
              <span className={styles.service}>{it.service}</span>
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
            </>
          ) : null}
          <span className={styles.county}>{it.county}</span>
        </li>
      ))}
    </ul>
  );
});

export function JobTicker({ className }: { className?: string }) {
  const [items, setItems] = useState<TickerItem[]>([]);
  const outer = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLUListElement>(null);
  const [copies, setCopies] = useState(2);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    let live = true;
    loadFeed().then((rows) => live && setItems(rows));
    return () => {
      live = false;
    };
  }, []);

  // Measure after paint and again whenever the header changes width: how
  // wide one copy is (the distance one loop travels) and how many copies it
  // takes to keep the visible window full while the first one scrolls out.
  useLayoutEffect(() => {
    if (items.length === 0 || !outer.current || !first.current) return;
    const measure = () => {
      const w = first.current?.getBoundingClientRect().width ?? 0;
      const box = outer.current?.getBoundingClientRect().width ?? 0;
      if (w === 0) return;
      setShift(w);
      setCopies(Math.max(2, Math.ceil(box / w) + 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer.current);
    return () => ro.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const duration = shift > 0 ? (shift + GAP) / SPEED : 0;

  return (
    <div
      ref={outer}
      className={`${styles.ticker} ${className ?? ''}`}
      aria-label="Latest jobs"
      data-ready={shift > 0 || undefined}
    >
      <div
        className={styles.track}
        style={{ ['--shift' as string]: `${-(shift + GAP)}px`, ['--dur' as string]: `${duration}s` }}
      >
        <List items={items} ref={first} />
        {Array.from({ length: copies - 1 }, (_, i) => (
          <List key={i} items={items} hidden />
        ))}
      </div>
    </div>
  );
}
