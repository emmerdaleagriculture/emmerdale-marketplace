import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SignupForm } from './SignupForm';
import { getUser, safeInternalPath } from '@/lib/auth';
import a from '../auth.module.css';

/**
 * A customer arrives here from the "Create an account" button on their own job
 * page, carrying ?next=/my/<token>. Everything below the form was written for
 * contractors — join the network, counties covered, how quoting pays — which
 * reads to a customer as though they are in the wrong place, or worse, as
 * though they are signing up to do the work themselves.
 *
 * Same form, same auth, different explanation.
 */
function isCustomerSignup(next: string | null): boolean {
  return !!next && next.startsWith('/my/');
}

export const metadata: Metadata = {
  title: 'Join the network',
  description:
    'Sign up as a contractor — paddock and land jobs matched to the counties you cover, free to join, with the customer’s payment handled and released to you when the job is done.',
  alternates: { canonical: '/signup' },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeInternalPath((await searchParams).next);
  // Already signed in: a customer arriving from a job link goes back to it,
  // a contractor goes to their account as before.
  if (await getUser()) redirect(next ?? '/account');

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          {isCustomerSignup(next) ? (
            <>
              <div className={a.eyebrow}>For customers</div>
              <h1 className={a.title}>Create your account</h1>
              <p className={a.sub}>
                An email address and a password, and that&rsquo;s it. Your job is
                saved to the account, and this is how you get back to it later.
              </p>
              <ul className={a.benefits}>
                <li>
                  <div>
                    <strong>Everything in one place</strong>
                    <span>
                      Every job you&rsquo;ve booked with us, what stage it&rsquo;s at,
                      and the prices you were given.
                    </span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Order the same work again</strong>
                    <span>
                      A couple of taps and it goes back out to contractors — the field,
                      the access notes and the boundary you drew, all still there.
                    </span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Or have it go out on its own</strong>
                    <span>
                      Set it to repeat every few months and it&rsquo;s sent for pricing
                      without you having to remember.
                    </span>
                  </div>
                </li>
              </ul>
            </>
          ) : (
            <>
            <div className={a.eyebrow}>For contractors</div>
            <h1 className={a.title}>
              Join the network — <em>free.</em>
            </h1>
            <p className={a.sub}>
              Create your account to get started. Next, we’ll ask about your
              business and the counties you cover — then we review your application
              and email you when you’re approved.
            </p>
            <ul className={a.benefits}>
              <li>
                <div>
                  <strong>Jobs come straight to your inbox</strong>
                  <span>
                    Work in the counties you cover, sent to you as it comes in. Nothing to
                    check, no board to watch.
                  </span>
                </div>
              </li>
              <li>
                <div>
                  <strong>It costs you nothing</strong>
                  <span>
                    Free to join and free to quote, and you keep the price you give us —
                    our margin sits on top, paid by the customer.
                  </span>
                </div>
              </li>
              <li>
                <div>
                  <strong>We handle the payment</strong>
                  <span>
                    The customer pays us in full before you start, so the money is there
                    from day one. It’s released to you once the job’s done and confirmed —
                    no invoicing, no chasing.
                  </span>
                </div>
              </li>
              <li>
                <div>
                  <strong>You get a proper job pack</strong>
                  <span>
                    Location, acreage, access, gateway width and photos, checked before it
                    reaches you — so you can price it without a site visit or a phone call.
                  </span>
                </div>
              </li>
            </ul>
            </>
          )}

          <SignupForm next={next ?? undefined} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
