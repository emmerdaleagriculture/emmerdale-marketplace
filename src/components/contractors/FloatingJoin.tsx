'use client';

import { useEffect, useState } from 'react';
import { TrackedLink } from '@/components/home/Track';
import s from './floatingJoin.module.css';

/**
 * A "Join free" pill that floats bottom-left on the contractor pages, so
 * the way to sign up is never a scroll away. Bottom-left because the
 * feedback tab owns bottom-right.
 *
 * Hidden while the hero's own Join button is on screen (`after`), and again
 * once the closing Join section is (`until`) — never two Join buttons in view
 * at once. Tracked as operator_apply like the page's other Join links, with
 * its own location, so its share of sign-ups can be read.
 */
export function FloatingJoin({
  href,
  location,
  after,
  until,
}: {
  href: string;
  location: string;
  /** id of the hero CTA: shown once it has scrolled off the top. */
  after: string;
  /** id of the closing CTA section: hidden once it is in view. */
  until: string;
}) {
  const [pastHero, setPastHero] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const hero = document.getElementById(after);
    const end = document.getElementById(until);
    if (!hero || !('IntersectionObserver' in window)) {
      setPastHero(true);
      return;
    }
    // A fast scroll can batch several crossings into one callback, oldest
    // first: only the last entry says where the element is now.
    const latest = (entries: IntersectionObserverEntry[]) => entries[entries.length - 1];
    const heroIo = new IntersectionObserver(
      (entries) => {
        const e = latest(entries);
        setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    heroIo.observe(hero);
    const endIo = new IntersectionObserver((entries) => setAtEnd(latest(entries).isIntersecting), {
      threshold: 0,
    });
    if (end) endIo.observe(end);
    return () => {
      heroIo.disconnect();
      endIo.disconnect();
    };
  }, [after, until]);

  const visible = pastHero && !atEnd;

  return (
    <div className={`${s.root} ${visible ? s.visible : ''}`} aria-hidden={!visible}>
      <TrackedLink
        href={href}
        event="operator_apply"
        params={{ location }}
        className={s.btn}
        tabIndex={visible ? 0 : -1}
      >
        Join free →
      </TrackedLink>
    </div>
  );
}
