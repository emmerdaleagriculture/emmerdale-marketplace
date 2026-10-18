import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAppRequest } from '@/lib/appMode.server';

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // The app has no marketing home page to go back to: its front door is the
  // welcome screen.
  const to = (await isAppRequest()) ? '/app' : '/';
  return NextResponse.redirect(new URL(to, request.url), { status: 303 });
}
