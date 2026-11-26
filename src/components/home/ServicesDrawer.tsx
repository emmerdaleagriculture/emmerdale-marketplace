'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import s from './home.module.css';

/**
 * The service board, folded away under its own heading. A native <details>,
 * so it opens without JavaScript and the cards stay in the page for search
 * engines. The only script is for "/#services" links (the footer has some):
 * a link to a closed drawer should land on an open one.
 */
export default function ServicesDrawer({
  eyebrow,
  heading,
  children,
}: {
  eyebrow: string;
  heading: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const openForHash = () => {
      if (window.location.hash !== '#services' || !ref.current) return;
      ref.current.open = true;
      ref.current.scrollIntoView({ block: 'start' });
    };
    openForHash();
    window.addEventListener('hashchange', openForHash);
    return () => window.removeEventListener('hashchange', openForHash);
  }, []);

  return (
    <details ref={ref} className={s.servicesDrawer}>
      <summary className={s.servicesSummary}>
        {/* Direct children of the summary: a heading may sit in a summary,
            but not inside a span. The grid in the stylesheet lays them out. */}
        <span className={s.eyebrow}>{eyebrow}</span>
        <h2 className={s.sectionH}>{heading}</h2>
        <svg
          className={s.servicesChevron}
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={s.servicesDrawerBody}>{children}</div>
    </details>
  );
}
