import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * POST /api/stripe/checkout — start a £20/mo subscription Checkout for the
 * signed-in contractor. Reuses (or creates) their Stripe customer, then
 * redirects to Stripe Checkout.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE()}/login`, { status: 303 });

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.redirect(`${SITE()}/account?sub=unconfigured`, { status: 303 });
  }

  const admin = createServiceRoleClient();
  const { data: contractor } = await admin
    .from('contractors')
    .select('email, business_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor) return NextResponse.redirect(`${SITE()}/account`, { status: 303 });

  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('contractor_id', user.id)
    .maybeSingle();

  const stripe = getStripe();
  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: contractor.email,
      name: contractor.business_name,
      metadata: { contractor_id: user.id },
    });
    customerId = customer.id;
    await admin
      .from('subscriptions')
      .upsert({ contractor_id: user.id, stripe_customer_id: customerId, status: 'none' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${SITE()}/account?sub=success`,
    cancel_url: `${SITE()}/account?sub=cancelled`,
    allow_promotion_codes: true,
  });

  return NextResponse.redirect(session.url!, { status: 303 });
}
