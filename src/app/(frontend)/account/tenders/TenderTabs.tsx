'use client';

import { useEffect, useState, type ReactNode } from 'react';
import s from './tenders.module.css';

export type TenderTab = { key: 'live' | 'renewals'; label: string; count: number; fresh?: number; body: ReactNode };

/**
 * The two tender feeds as switchable tabs: open tenders and early notices,
 * and contracts coming up for renewal. Both are server-rendered; this only
 * shows one at a time. The choice rides in the URL hash (#renewals) so a
 * refresh or a back-navigation lands on the same feed.
 */
export function TenderTabs({ tabs, initial }: { tabs: TenderTab[]; initial: TenderTab['key'] }) {
  const [active, setActive] = useState<TenderTab['key']>(initial);

  // Once, after hydration: a #renewals in the URL picks that tab.
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h === 'live' || h === 'renewals') setActive(h);
  }, []);

  const pick = (key: TenderTab['key']) => {
    setActive(key);
    history.replaceState(null, '', `#${key}`);
  };

  return (
    <>
      <div className={s.tabs} role="tablist" aria-label="Council tenders">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`panel-${t.key}`}
            className={active === t.key ? `${s.tab} ${s.tabOn}` : s.tab}
            onClick={() => pick(t.key)}
          >
            <span>{t.label}</span>
            <span className={s.tabCount}>
              {t.count}
              {t.fresh ? <b className={s.tabNew}>{t.fresh} new</b> : null}
            </span>
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <section
          key={t.key}
          role="tabpanel"
          id={`panel-${t.key}`}
          aria-labelledby={`tab-${t.key}`}
          hidden={active !== t.key}
        >
          {t.body}
        </section>
      ))}
    </>
  );
}
