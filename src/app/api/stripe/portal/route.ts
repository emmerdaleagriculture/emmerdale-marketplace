import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * POST /api/stripe/portal — open the Stripe customer portal for self-service
 * management (update card, cancel). Redirects to the portal.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE()}/login`, { status: 303 });

  const admin = createServiceRoleClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('contractor_id', user.id)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.redirect(`${SITE()}/account`, { status: 303 });
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${SITE()}/account`,
  });

  return NextResponse.redirect(session.url, { status: 303 });
}
