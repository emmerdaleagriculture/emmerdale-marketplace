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
 * from the closing Join section (`until`) to the bottom of the page — never two Join buttons in view
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
  const [visible, setVisible] = useState(false);

  // Measured on scroll rather than with IntersectionObserver: an observer
  // only reports crossings, and a jump from the footer straight back up the
  // page takes the closing section from above the screen to below it without
  // crossing — which left the button hidden for good.
  useEffect(() => {
    const hero = document.getElementById(after);
    const end = document.getElementById(until);
    let frame = 0;
    const update = () => {
      frame = 0;
      const pastHero = hero ? hero.getBoundingClientRect().bottom < 0 : true;
      // From the moment the closing section enters the screen to the bottom
      // of the page (the footer below it is taller than a phone screen).
      const atEnd = end ? end.getBoundingClientRect().top < window.innerHeight : false;
      setVisible(pastHero && !atEnd);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [after, until]);


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
