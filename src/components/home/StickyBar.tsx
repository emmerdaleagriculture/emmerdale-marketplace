'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import s from './home.module.css';

/**
 * Mobile-only bottom bar with the one yellow "Get a price" button. Hidden
 * while the intro (which carries its own CTA) is on screen; slides up once
 * the visitor scrolls past it. Desktop never shows it (CSS).
 */
export function StickyBar({ href, watch }: { href: string; watch: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(watch);
    if (!target || !('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [watch]);

  return (
    <div className={`${s.stickybar} ${visible ? s.stickybarVisible : ''}`} aria-hidden={!visible}>
      <div className={s.stickybarInner}>
        <Link href={href} className={s.stickybarBtn} tabIndex={visible ? 0 : -1}>
          Get a price
        </Link>
      </div>
    </div>
  );
}
