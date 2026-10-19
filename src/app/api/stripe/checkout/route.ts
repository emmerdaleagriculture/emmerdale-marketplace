import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  changeMembershipTier,
  isMembershipTier,
  membershipReturnPath,
  premiumCheckoutUrl,
  PREMIUM_PLANS,
  type MembershipTier,
  type PremiumPlan,
} from '@/lib/stripe';

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * POST /api/stripe/checkout — start a membership Checkout for the signed-in
 * contractor: form fields `tier` (premium £20/£199 or open £49/£399) and
 * `plan` (monthly or annual). Reuses (or creates) their Stripe customer,
 * then redirects to Stripe Checkout. Someone already subscribed asking for
 * a different tier or plan has the live subscription moved to it, prorated;
 * asking for what they already have goes to the billing portal.
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
  const tierField = form?.get('tier');
  const tier: MembershipTier = isMembershipTier(tierField) ? tierField : 'premium';
  // Back to the page the button was on: the dashboard or /account/membership.
  const back = membershipReturnPath(form?.get('return'));
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(`${SITE()}${back}?sub=unconfigured#premium`, { status: 303 });
  }

  const admin = createServiceRoleClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, tier, plan')
    .eq('contractor_id', user.id)
    .maybeSingle();
  if (sub?.status === 'active' || sub?.status === 'past_due') {
    if (sub.tier === tier && sub.plan === plan) {
      return NextResponse.redirect(`${SITE()}/api/stripe/portal`, { status: 307 });
    }
    try {
      const changed = await changeMembershipTier(user.id, tier, plan);
      if (changed) {
        return NextResponse.redirect(`${SITE()}${back}?sub=changed#premium`, { status: 303 });
      }
    } catch (err) {
      console.error('[stripe] membership change failed:', err);
      return NextResponse.redirect(`${SITE()}${back}?sub=unconfigured#premium`, { status: 303 });
    }
  }

  try {
    const url = await premiumCheckoutUrl(user.id, plan, back, tier);
    return NextResponse.redirect(url, { status: 303 });
  } catch (err) {
    console.error('[stripe] premium checkout failed:', err);
    return NextResponse.redirect(`${SITE()}${back}?sub=unconfigured#premium`, { status: 303 });
  }
}
