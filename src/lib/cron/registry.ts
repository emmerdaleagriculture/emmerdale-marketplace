/**
 * The scheduled jobs this app declares, and what each is for.
 *
 * Vercel Cron reads `vercel.json`; nothing reads this. It exists so the admin
 * page can say something `cron_runs` cannot: that a job is *supposed* to run.
 * A table of runs alone can only ever show what happened, so a cron that was
 * never registered — or silently dropped from vercel.json — looks identical
 * to one that simply had nothing to do. Declaring them here turns that into a
 * missing row, which is visible.
 *
 * Keep `schedule` in step with vercel.json by hand. It is only used to say
 * when a run was due, so a stale entry misleads about lateness and nothing
 * else — but it does mislead, so change both together.
 */
export type CronJob = {
  /** Also the `name` written to cron_runs. */
  name: string;
  path: string;
  schedule: string;
  /** Roughly how often it fires, for deciding whether it is late. */
  everyMinutes: number;
  what: string;
};

export const HTTP_CRONS: CronJob[] = [
  {
    name: 'heartbeat',
    path: '/api/cron/heartbeat',
    schedule: '*/15 * * * *',
    everyMinutes: 15,
    what: 'Checks every job here, the queues, Books, Stripe and Resend, and the site itself; results on Admin › Errors.',
  },
  {
    name: 'books-stripe-sync',
    path: '/api/cron/books-stripe-sync',
    schedule: '20 4 * * *',
    everyMinutes: 24 * 60,
    what: 'Brings each Books member’s Stripe fees, payouts and refunds into their books.',
  },
  {
    name: 'books-marketplace-sync',
    path: '/api/cron/books-marketplace-sync',
    schedule: '35 4 * * *',
    everyMinutes: 24 * 60,
    what: 'Books each Books member’s signed-off marketplace jobs (sales to Emmerdale) and our payouts.',
  },
  {
    name: 'balances',
    path: '/api/cron/balances',
    schedule: '*/15 * * * *',
    everyMinutes: 15,
    what: 'Charges the balances that sign-off made due, with retries and a back-off.',
  },
  {
    name: 'draft-chaser',
    path: '/api/cron/draft-chaser',
    schedule: '*/30 * * * *',
    everyMinutes: 30,
    what: 'One reminder to anyone who described a job, left an email and never pressed Send.',
  },
  {
    name: 'premium-sync',
    path: '/api/cron/premium-sync',
    schedule: '40 3 * * *',
    everyMinutes: 24 * 60,
    what: 'Re-reads every membership from Stripe, so renewals and cancellations land even if the webhook missed them.',
  },
  {
    name: 'tender-watch',
    path: '/api/cron/tender-watch',
    schedule: '0 6 * * *',
    everyMinutes: 24 * 60,
    what: 'Pulls council land contracts from Contracts Finder and Find a Tender into the pool Premium members see on Council tenders.',
  },
  {
    name: 'seo-agent',
    path: '/api/cron/seo-agent',
    schedule: '0 7 1 * *',
    everyMinutes: 31 * 24 * 60,
    what: 'Cheatcode, the monthly Search Console review: drafts SEO opportunities with Claude for /admin/seo/opportunities and emails the digest.',
  },
];

/**
 * How late a job may be before it is worth saying so.
 *
 * Three intervals rather than one: a single missed run is ordinary — a deploy
 * lands, a function cold-starts, Vercel's scheduler drifts a minute — and a
 * page that cries wolf on all three of those gets ignored by the time it
 * matters. Three in a row is a stopped job.
 */
export const LATE_AFTER_MISSED_RUNS = 3;

export function isLate(job: CronJob, lastStart: string | null, now = Date.now()): boolean {
  // Never run at all is not "late", it is "never seen" — a different and
  // worse thing, which the page says in its own words.
  if (!lastStart) return false;
  const gapMinutes = (now - Date.parse(lastStart)) / 60_000;
  return gapMinutes > job.everyMinutes * LATE_AFTER_MISSED_RUNS;
}
