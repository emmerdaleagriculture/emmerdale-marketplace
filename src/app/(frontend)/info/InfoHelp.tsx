'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import css from './info.module.css';

/**
 * The help and background on an Info page, folded into a drawer so the tool
 * stays on the first screen. Closed to start with; it opens itself when the
 * address points at something inside it (/info/weeds#law), on arrival or
 * when the hash changes.
 */
export function InfoHelp({ title = 'Help and the detail', children }: { title?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const openForHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id || !ref.current) return;
      const target = document.getElementById(id);
      if (target && ref.current.contains(target)) {
        ref.current.open = true;
        target.scrollIntoView({ block: 'start' });
      }
    };
    openForHash();
    window.addEventListener('hashchange', openForHash);
    return () => window.removeEventListener('hashchange', openForHash);
  }, []);

  return (
    <details ref={ref} className={css.help}>
      <summary className={css.helpHead}>{title}</summary>
      <div className={css.helpBody}>{children}</div>
    </details>
  );
}
