'use client';

import Link from 'next/link';
import { ServiceIcon } from './ServiceIcons';
import type { HomeService } from '@/lib/home/services';
import s from './home.module.css';

// window.gtag is declared once, in @/components/Analytics.

/**
 * One card on the service board.
 *
 * A client component for one reason: `select_service`. Which service a visitor
 * picks is the single most useful thing the board can report — it says what
 * people are actually shopping for, and it is what tells Ads which terms are
 * worth bidding on. Without it every service reports into one undifferentiated
 * funnel, which is the whole problem the per-service work is meant to fix.
 *
 * The href carries the service into the form via LandingFlow's existing
 * prefill contract, so the card still works with JavaScript disabled — the
 * event is the only thing lost.
 */
export function ServiceCard({ svc, href }: { svc: HomeService; href: string }) {
  return (
    <Link
      href={href}
      className={s.service}
      onClick={() => window.gtag?.('event', 'select_service', { service: svc.slug, source: 'board' })}
    >
      <span className={s.serviceIcon}>
        <ServiceIcon icon={svc.icon} />
      </span>
      <h3 className={s.serviceName}>{svc.name}</h3>
      <p className={s.serviceBlurb}>{svc.blurb}</p>
      <span className={s.serviceFoot}>
        <b>Compare prices</b>
        <span>Free →</span>
        <span className={s.visuallyHidden}> for {svc.label}</span>
      </span>
    </Link>
  );
}
