import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { appLandingPath, roleIntent } from '@/lib/app/landing';

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
  return NextResponse.redirect(`${origin}${to}`);
}
