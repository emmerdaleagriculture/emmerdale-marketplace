import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { premiumCheckoutUrl, PREMIUM_PLANS, type PremiumPlan } from '@/lib/stripe';

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
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status')
    .eq('contractor_id', user.id)
    .maybeSingle();
  if (sub?.status === 'active' || sub?.status === 'past_due') {
    return NextResponse.redirect(`${SITE()}/api/stripe/portal`, { status: 307 });
  }

  try {
    const url = await premiumCheckoutUrl(user.id, plan);
    return NextResponse.redirect(url, { status: 303 });
  } catch (err) {
    console.error('[stripe] premium checkout failed:', err);
    return NextResponse.redirect(`${SITE()}/account?sub=unconfigured#premium`, { status: 303 });
  }
}
