import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { NO_OBLIGATION_SHORT, PROMISES } from '@/lib/home/proposition';
import { jobAcres } from '@/lib/jobParse/geometry';
import { CUSTOMER_LIVE_STATUSES, CUSTOMER_STATUS_LABEL, greeting } from '@/lib/customers/statusLabels';
import { ServiceTileIcon, POPULAR_SERVICES } from './popular';
import { listSites } from '@/lib/customers/sites';
import ui from '../app-ui.module.css';

export const metadata: Metadata = { title: 'Home', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The customer's Home tab in the app: a greeting, the one thing they open
 * the app to do (get prices for a job, straight into /start), their latest
 * jobs with how many prices are in, the common jobs as tiles, and the
 * promises from the home page.
 *
 * Contractors have no Home tab (theirs opens on Jobs), so one arriving here
 * is sent on. Someone signed in with neither row has not finished the role
 * step yet and goes back to the welcome flow.
 */
export default async function AppHomePage() {
  const user = await getUser();
  if (!user) redirect('/app');
  if (isAdminEmail(user.email)) redirect('/admin');

  const admin = createServiceRoleClient();
  const [customer, contractor] = await Promise.all([
    admin.from('customers').select('contact_name').eq('id', user.id).maybeSingle(),
    admin.from('contractors').select('id').eq('id', user.id).maybeSingle(),
  ]);
  if (!customer.data) redirect(contractor.data ? '/invitations' : '/app');

  const { data: jobs } = await admin
    .from('job_submissions')
    .select('id, status, client_token, service_verbatim, postcode, area_value, area_unit, area_mapped_value, area_source, boundary, service:services(name)')
    .eq('customer_id', user.id)
    .not('status', 'in', '(draft,abandoned)')
    .order('created_at', { ascending: false })
    .limit(3);

  const ids = (jobs ?? []).map((j) => j.id);
  const { data: quotes } = ids.length
    ? await admin
        .from('client_quotes')
        .select('submission_id, client_price_pence')
        .in('submission_id', ids)
        .eq('status', 'active')
    : { data: [] as { submission_id: string; client_price_pence: number }[] };
  const prices = new Map<string, number[]>();
  for (const q of quotes ?? []) {
    prices.set(q.submission_id, [...(prices.get(q.submission_id) ?? []), q.client_price_pence]);
  }

  const [site] = await listSites(user.id);
  const firstName = (customer.data.contact_name ?? '').trim().split(/\s+/)[0] || null;
  const initial = (firstName ?? user.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <main className={ui.screen}>
      <header className={ui.head}>
        <div>
          <div className={ui.greeting}>{greeting()}</div>
          <h1 className={ui.who}>{firstName ?? 'Welcome'}</h1>
        </div>
        <Link href="/app/account" className={ui.avatar} aria-label="Account">
          {initial}
        </Link>
      </header>

      <Link href="/app/new-job" className={ui.ctaCard}>
        <Image
          src="/john-deere-6130r-kuhn.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 600px) 100vw, 560px"
          className={ui.ctaImg}
        />
        {site && (
          <span className={ui.ctaChip}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s-7-7.2-7-12a7 7 0 0 1 14 0c0 4.8-7 12-7 12Z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            {site.label} · {site.postcode.split(' ')[0]}
          </span>
        )}
        <div className={ui.ctaTitle}>Get prices for a job</div>
        <div className={ui.ctaSub}>Takes about a minute. {NO_OBLIGATION_SHORT}</div>
        <span className={ui.ctaGo}>
          Start <span aria-hidden="true">›</span>
        </span>
      </Link>

      {(jobs ?? []).length > 0 && (
        <>
          <div className={ui.sectionHead}>
            <h2 className={ui.sectionTitle}>Your jobs</h2>
            <Link href="/my" className={ui.sectionLink}>
              See all
            </Link>
          </div>
          <div className={ui.list}>
            {(jobs ?? []).map((j) => {
              const ps = prices.get(j.id) ?? [];
              const live = CUSTOMER_LIVE_STATUSES.has(j.status);
              // The one display rule for a job's size (lib/jobParse/geometry).
              const acres = jobAcres(j);
              const size = acres != null ? `${acres} acres` : j.area_value != null && j.area_unit === 'linear_m' ? `${j.area_value} m` : null;
              return (
                <Link key={j.id} href={`/my/${j.client_token}`} className={ui.card}>
                  <div className={ui.cardRow}>
                    <div>
                      <div className={ui.cardTitle}>{j.service?.name ?? j.service_verbatim ?? 'Job'}</div>
                      <div className={ui.cardSub}>
                        {[size, j.postcode?.split(' ')[0]].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <span className={ui.chevron} aria-hidden="true">
                      ›
                    </span>
                  </div>
                  {ps.length > 0 && live ? (
                    <span className={`${ui.chip} ${ui.chipYellow}`}>
                      {ps.length} price{ps.length === 1 ? '' : 's'}
                      {ps.length > 1
                        ? ` · ${formatGBP(Math.min(...ps))} to ${formatGBP(Math.max(...ps))}`
                        : ` · ${formatGBP(ps[0])}`}
                    </span>
                  ) : (
                    <span className={`${ui.chip} ${live ? '' : ui.chipGrey}`}>
                      {CUSTOMER_STATUS_LABEL[j.status] ?? j.status}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}

      <div className={ui.sectionHead}>
        <h2 className={ui.sectionTitle}>Popular jobs</h2>
      </div>
      <div className={ui.tiles}>
        {POPULAR_SERVICES.map((svc) => (
          <Link key={svc.name} href={`/app/new-job?service=${svc.slug}`} className={ui.tile}>
            <ServiceTileIcon name={svc.icon} />
            {svc.name}
          </Link>
        ))}
      </div>

      <div className={ui.sectionHead}>
        <h2 className={ui.sectionTitle}>Why book through us</h2>
      </div>
      <ul className={ui.promises}>
        {PROMISES.map(([title, body]) => (
          <li key={title} className={ui.promise}>
            <span aria-hidden="true" className={ui.tick}>
              ✓
            </span>
            <span>
              <strong>{title}</strong> {body}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
