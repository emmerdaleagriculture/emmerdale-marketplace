import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail } from '@/lib/auth';
import { appLandingPath, roleIntent } from '@/lib/app/landing';
import { isAppRequest } from '@/lib/appMode.server';
import { PUSH_ASKED_COOKIE, SITE_ASKED_COOKIE } from '@/lib/app/onboardingCookies';
import { listSites } from '@/lib/customers/sites';
import { confirmedAuthPhone } from '@/lib/app/phoneFlow';

export const dynamic = 'force-dynamic';

/**
 * Where every app sign-in ends up: the native sheets, the email code and
 * the OAuth callback all send the browser here, and this decides between
 * the tabs and the role screen (lib/app/landing.ts).
 *
 * A page that only redirects, not a route handler. Server actions (email
 * code, phone, role, land) end in redirect('/app/continue'). With a route
 * handler here, the router showed the next screen but kept /app/continue
 * as the address, so that screen's own server actions POSTed to
 * /app/continue, which only answered GET. Sentry JAVASCRIPT-NEXTJS-8,
 * "An unexpected response was received from the server" (Use my current
 * location while adding a job). A page's redirect() is followed by the
 * router, and the address becomes the real screen.
 */
export default async function AppContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const sp = await searchParams;
  const role = sp.role ?? null;
  const user = await getUser();
  if (!user) redirect('/app');
  const to = await appLandingPath(user.id, user.email, roleIntent(role));
  // Once per device, after the role is settled and before the tabs: the
  // notifications explainer (task 7). Admins and the website are spared.
  const jar = await cookies();
  const inApp = !to.startsWith('/app/role') && !isAdminEmail(user.email) && (await isAppRequest());
  // The phone comes before the land and notifications steps (PRD order:
  // role, phone, then the rest); the gate on the destinations alone would
  // let those two run first.
  if (inApp && !confirmedAuthPhone(user)) {
    redirect(`/app/phone?next=${encodeURIComponent(`/app/continue${role ? `?role=${role}` : ''}`)}`);
  }
  // A new customer's first site (task 6), once, unless they skipped it.
  if (inApp && to === '/app/home' && jar.get(SITE_ASKED_COOKIE)?.value !== '1') {
    const sites = await listSites(user.id);
    if (sites.length === 0) {
      redirect(`/app/location?next=${encodeURIComponent('/app/continue')}`);
    }
  }
  const asked = jar.get(PUSH_ASKED_COOKIE)?.value === '1';
  if (inApp && !asked) {
    redirect(`/app/notify?next=${encodeURIComponent(to)}`);
  }
  redirect(to);
}
