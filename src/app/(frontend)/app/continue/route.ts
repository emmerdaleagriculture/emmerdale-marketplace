import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUser, isAdminEmail } from '@/lib/auth';
import { appLandingPath, roleIntent } from '@/lib/app/landing';
import { isAppRequest } from '@/lib/appMode.server';
import { PUSH_ASKED_COOKIE, SITE_ASKED_COOKIE } from '@/lib/app/onboardingCookies';
import { listSites } from '@/lib/customers/sites';
import { confirmedAuthPhone } from '@/lib/app/phoneFlow';

/**
 * Where every app sign-in ends up: the native sheets, the email code and
 * the OAuth callback all send the browser here, and this decides between
 * the tabs and the role screen (lib/app/landing.ts). A route rather than a
 * page so the decision is one redirect with nothing rendered in between.
 */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${origin}/app`);
  const to = await appLandingPath(user.id, user.email, roleIntent(searchParams.get('role')));
  // Once per device, after the role is settled and before the tabs: the
  // notifications explainer (task 7). Admins and the website are spared.
  const jar = await cookies();
  const inApp = !to.startsWith('/app/role') && !isAdminEmail(user.email) && (await isAppRequest());
  // The phone comes before the land and notifications steps (PRD order:
  // role, phone, then the rest); the gate on the destinations alone would
  // let those two run first.
  if (inApp && !confirmedAuthPhone(user)) {
    return NextResponse.redirect(`${origin}/app/phone?next=${encodeURIComponent(`/app/continue${searchParams.get('role') ? `?role=${searchParams.get('role')}` : ''}`)}`);
  }
  // A new customer's first site (task 6), once, unless they skipped it.
  if (inApp && to === '/app/home' && jar.get(SITE_ASKED_COOKIE)?.value !== '1') {
    const sites = await listSites(user.id);
    if (sites.length === 0) {
      return NextResponse.redirect(`${origin}/app/location?next=${encodeURIComponent('/app/continue')}`);
    }
  }
  const asked = jar.get(PUSH_ASKED_COOKIE)?.value === '1';
  if (inApp && !asked) {
    return NextResponse.redirect(`${origin}/app/notify?next=${encodeURIComponent(to)}`);
  }
  return NextResponse.redirect(`${origin}${to}`);
}
