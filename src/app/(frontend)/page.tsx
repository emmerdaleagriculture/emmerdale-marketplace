import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getServices } from '@/lib/reference';
import { COMPANY_LEGAL_NAME, COMPANY_NUMBER, HPM_URL } from '@/lib/site';
import s from './landing.module.css';
import f from '@/components/forms/forms.module.css';

export const metadata: Metadata = {
  title: 'Emmerdale Agriculture — The contractor network',
  description:
    'Paddock and land jobs across the country, passed to contractors who can actually do them. Sign up free, get matched by county, and bid to win the work.',
};

const STEPS = [
  {
    n: 1,
    title: 'Sign up & choose your counties',
    body: 'Tell us what you do and where you work. Pick your counties by region in a couple of clicks.',
  },
  {
    n: 2,
    title: 'Get matched by county',
    body: 'When a job lands in one of your counties, we email you the details — town, work needed, and when bidding closes.',
  },
  {
    n: 3,
    title: 'Bid and win the work',
    body: 'Put in your price. Win the job and you get the customer’s details to arrange it directly. You invoice them — we take no cut.',
  },
];

export default async function LandingPage() {
  const services = await getServices();

  return (
    <div className={s.page}>
      <section className={s.hero}>
        <Image
          src="/john-deere-6250r.webp"
          alt="A John Deere 6250R working in a Hampshire field"
          fill
          priority
          sizes="100vw"
          className={s.heroImg}
        />
        <div className={s.heroOverlay} />
        <SiteHeader variant="overlay" />
        <div className={s.heroInner}>
          <div className={s.eyebrow}>The network</div>
          <h1 className={s.h1}>
            Paddock and land jobs across the country, passed to contractors who can{' '}
            <em>actually do them.</em>
          </h1>
          <p className={s.heroSub}>
            Hampshire Paddock Management turns away more work than it can service.
            That overflow goes to the network — matched to contractors by county,
            awarded by bid.
          </p>
          <div className={s.heroCtas}>
            <Link href="/signup" className={f.btnYellow}>
              Join the network — free
            </Link>
            <Link href="/#how-it-works" className={f.btnGhost} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
              See how it works
            </Link>
          </div>
        </div>
      </section>

      <section id="how-it-works" className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>How it works</div>
          <h2 className={s.sectionTitle}>
            Three steps to <em>winning work.</em>
          </h2>
          <p className={s.sectionLede}>
            No cost to join. No obligation to bid. Just jobs in your area when they
            come up.
          </p>
          <div className={s.steps}>
            {STEPS.map((step) => (
              <div key={step.n} className={s.step}>
                <div className={s.stepNum}>{step.n}</div>
                <div className={s.stepTitle}>{step.title}</div>
                <p className={s.stepBody}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>The work</div>
          <h2 className={s.sectionTitle}>Paddock &amp; land services</h2>
          <p className={s.sectionLede}>
            The jobs posted to the network span the full range of paddock and land
            maintenance.
          </p>
          <div className={s.services}>
            {services.map((svc) => (
              <span key={svc.id} className={s.serviceTag}>
                {svc.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={s.cred}>
        <div className={s.credInner}>
          <h2 className={s.credTitle}>
            Run by a firm that does this work <em>every day.</em>
          </h2>
          <p className={s.credBody}>
            The network exists because {COMPANY_LEGAL_NAME} — the company behind{' '}
            <a href={HPM_URL}>Hampshire Paddock Management</a> — receives more
            enquiries than it can take on. Rather than turn good jobs away, we pass
            them to vetted contractors who can do them.
          </p>
          <p className={s.credMeta}>
            {COMPANY_LEGAL_NAME} · Company No. {COMPANY_NUMBER}
          </p>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.teaser}>
          <div className={s.teaserTitle}>
            Or get <em>direct access</em> to every job
          </div>
          <p className={s.teaserBody}>
            Paid members see every job in their counties 12 hours before anyone
            else — full details including customer contact, no bidding.
          </p>
          <p className={s.teaserBody}>
            <strong>£20/month.</strong> See every job twelve hours early — and skip
            the bidding entirely.
          </p>
          <p className={s.teaserNote}>Coming soon. Join free now and we’ll tell you when it launches.</p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
