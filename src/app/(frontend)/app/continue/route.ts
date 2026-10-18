import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUser, isAdminEmail } from '@/lib/auth';
import { appLandingPath, roleIntent } from '@/lib/app/landing';
import { isAppRequest } from '@/lib/appMode.server';
import { PUSH_ASKED_COOKIE } from '@/lib/app/pushCookie';

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
  const asked = (await cookies()).get(PUSH_ASKED_COOKIE)?.value === '1';
  if (!asked && !to.startsWith('/app/role') && !isAdminEmail(user.email) && (await isAppRequest())) {
    return NextResponse.redirect(`${origin}/app/notify?next=${encodeURIComponent(to)}`);
  }
  return NextResponse.redirect(`${origin}${to}`);
}
