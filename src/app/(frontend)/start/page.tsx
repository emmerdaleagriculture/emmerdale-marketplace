import type { Metadata } from 'next';
import { MinimalHeader } from '@/components/MinimalHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { LandingFlow } from './LandingFlow';
import a from '../auth.module.css';

/**
 * Paid-ads landing page. One job: convert a paid click into a complete,
 * normalised job record (spec Part 1). Deliberately noindexed, disallowed in
 * robots.txt and absent from the sitemap — this page exists for ad traffic
 * only.
 *
 * It reads no searchParams so it stays statically renderable: the step-1 form
 * markup ships in the initial HTML (spec §3). UTM/gclid attribution is read
 * client-side at submit time instead.
 */
export const metadata: Metadata = {
  title: 'Tell us about your job',
  robots: { index: false, follow: false },
};

export default function StartPage() {
  return (
    <div className={a.wrap}>
      {/* Turnstile's challenge round-trip is the last thing between the
          customer and a working submit — start its connection immediately.
          React hoists these into <head>. */}
      <link rel="preconnect" href="https://challenges.cloudflare.com" />
      <MinimalHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Field &amp; paddock work</div>
          <h1 className={a.title}>Tell us what needs doing</h1>
          <p className={a.sub}>
            Describe the job in your own words — long grass, an overgrown
            paddock, a field that needs putting right. We&rsquo;ll sort the
            details and pass it to contractors who cover your area.
          </p>
          <LandingFlow />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
