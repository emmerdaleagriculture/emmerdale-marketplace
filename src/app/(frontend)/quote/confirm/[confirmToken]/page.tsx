import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { MinimalHeader } from '@/components/MinimalHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ConfirmQuoteButton } from './ConfirmQuoteButton';
import a from '../../../auth.module.css';

export const metadata: Metadata = {
  title: 'Confirm your price',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * One-click confirm for an email-parsed price (§17). The page shows what we
 * read and the click is a POST — never a GET side-effect, because mail
 * scanners prefetch links and would silently confirm prices.
 */
export default async function ConfirmQuotePage({
  params,
}: {
  params: Promise<{ confirmToken: string }>;
}) {
  const { confirmToken } = await params;
  if (!isTokenFormat(confirmToken)) notFound();

  const admin = createServiceRoleClient();
  const { data: quote } = await admin
    .from('contractor_quotes')
    .select('id, contractor_price_pence, confirmed_by_contractor, submission:job_submissions(status, postcode, service:services(name))')
    .eq('confirm_token', confirmToken)
    .maybeSingle();

  return (
    <div className={a.wrap}>
      <MinimalHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Your reply</div>
          <h1 className={a.title}>Confirm your price</h1>
          {!quote ? (
            <p className={a.sub}>
              This confirmation link has already been used or has been replaced by
              a newer price. Nothing more is needed.
            </p>
          ) : (
            <>
              <p className={a.sub}>
                We read your reply as a price of{' '}
                <strong>{formatGBP(quote.contractor_price_pence)}</strong> for the{' '}
                {(quote.submission?.service as { name: string } | null)?.name ?? 'job'} in{' '}
                {quote.submission?.postcode?.split(' ')[0] ?? 'your area'}. It won&rsquo;t
                be shown to the customer until you confirm it.
              </p>
              <ConfirmQuoteButton
                confirmToken={confirmToken}
                amountLabel={formatGBP(quote.contractor_price_pence)}
              />
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
