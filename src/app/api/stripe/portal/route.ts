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
  const params = { customer: sub.stripe_customer_id, return_url: `${SITE()}/account#premium` };
  let session;
  try {
    session = await stripe.billingPortal.sessions.create(params);
  } catch (err) {
    // A live account has no portal configuration until someone saves one in
    // the dashboard. Rather than a dead button, make a plain one: card,
    // invoices, and cancel at the end of the period already paid for.
    console.error('[stripe] portal session failed, creating a configuration:', err);
    const config = await stripe.billingPortal.configurations.create({
      business_profile: { headline: 'Emmerdale Agriculture premium membership' },
      features: {
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        subscription_cancel: { enabled: true, mode: 'at_period_end' },
      },
    });
    session = await stripe.billingPortal.sessions.create({ ...params, configuration: config.id });
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
