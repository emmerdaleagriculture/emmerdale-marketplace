import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { nonContractorPath } from '@/lib/auth';
import { HOLD_HOURS, last4, maskSortCode, onHold } from '@/lib/bankDetails';
import a from '../../auth.module.css';
import { BankForm } from './BankForm';

export const metadata: Metadata = { title: 'Bank details', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Where we pay a contractor: the account on file, masked, and the form to
 * change it. A change is confirmed with an emailed code and holds payouts
 * for HOLD_HOURS (src/lib/bankDetails.ts); the full numbers are never sent
 * back to the browser.
 */
export default async function BankPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account/bank');
  const { data: me } = await supabase.from('contractors').select('id').eq('id', user.id).maybeSingle();
  if (!me) redirect(await nonContractorPath(user.id));

  const { data: bank } = await createServiceRoleClient()
    .from('contractor_bank_details')
    .select('account_name, sort_code, account_number, hold_until, updated_at')
    .eq('contractor_id', user.id)
    .maybeSingle();
  const held = onHold(bank?.hold_until);

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide} style={{ maxWidth: 560 }}>
          <Breadcrumb tone="light" jsonLd={false} skipHome items={[{ label: 'Dashboard', href: '/account' }, { label: 'Bank details' }]} />
          <h1 className={a.title}>Bank details</h1>
          <p className={a.sub}>The account we pay you into once a customer has paid and your invoice is in.</p>

          {bank ? (
            <div style={{ border: '1px solid var(--rule)', borderRadius: 16, background: 'var(--white)', padding: '14px 16px', margin: '0 0 16px' }}>
              <div style={{ fontWeight: 600 }}>{bank.account_name}</div>
              <div style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                {maskSortCode(bank.sort_code)} · account ending {last4(bank.account_number)}
              </div>
              {held && (
                <p style={{ margin: '10px 0 0', fontSize: 14.5, color: 'var(--ink-2)' }}>
                  Changed recently: to keep you safe, payouts to this account start{' '}
                  {new Date(bank.hold_until!).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}.
                </p>
              )}
            </div>
          ) : (
            <p style={{ margin: '0 0 16px', color: 'var(--ink-2)' }}>We don’t have bank details for you yet.</p>
          )}

          <BankForm hasDetails={!!bank} holdHours={HOLD_HOURS} />

          <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 20 }}>
            Only Emmerdale can see these, and only to pay you. We send a code to your email before any change, tell you when
            they change, and hold payouts to a new account for {HOLD_HOURS} hours.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
