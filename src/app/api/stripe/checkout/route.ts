import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe, premiumPriceId, PREMIUM_PLANS, type PremiumPlan } from '@/lib/stripe';

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * POST /api/stripe/checkout — start a premium membership Checkout (form field
 * `plan`: monthly £20 or annual £199) for the signed-in contractor. Reuses (or
 * creates) their Stripe customer, then redirects to Stripe Checkout. Someone
 * already subscribed goes to the billing portal instead of a second plan.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE()}/login`, { status: 303 });

  const form = await request.formData().catch(() => null);
  const planField = String(form?.get('plan') ?? 'monthly');
  const plan: PremiumPlan = planField in PREMIUM_PLANS ? (planField as PremiumPlan) : 'monthly';
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(`${SITE()}/account?sub=unconfigured#premium`, { status: 303 });
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
    .select('stripe_customer_id, status')
    .eq('contractor_id', user.id)
    .maybeSingle();
  if (sub?.status === 'active' || sub?.status === 'past_due') {
    return NextResponse.redirect(`${SITE()}/api/stripe/portal`, { status: 307 });
  }

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
    line_items: [{ price: await premiumPriceId(stripe, plan), quantity: 1 }],
    subscription_data: { metadata: { contractor_id: user.id, plan } },
    success_url: `${SITE()}/account?sub=success#premium`,
    cancel_url: `${SITE()}/account?sub=cancelled#premium`,
    allow_promotion_codes: true,
  });

  return NextResponse.redirect(session.url!, { status: 303 });
}
