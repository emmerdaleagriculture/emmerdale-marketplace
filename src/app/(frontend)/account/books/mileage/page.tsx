import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAccounts, loadLedger, businessTypeOf } from '@/lib/books/server';
import { isPaymentAccount, personalAccountCode } from '@/lib/books/chart';
import { MILEAGE_BAND_MILES, MILEAGE_HIGH_PENCE, MILEAGE_LOW_PENCE } from '@/lib/books/mileage';
import { todayUk } from '@/lib/books/period';
import m from '../../market/market.module.css';
import { BooksFrame } from '../BooksFrame';
import { MileageForm } from './MileageForm';

export const metadata: Metadata = { title: 'Claim mileage', robots: { index: false, follow: false } };

export default async function MileagePage() {
  const access = await loadLedger('/account/books/mileage');
  if (!access.canEdit) redirect('/account/books');
  const accounts = await getAccounts(access.ledger.id);
  const personal = personalAccountCode(businessTypeOf(access.ledger));
  return (
    <BooksFrame access={access} title="Claim mileage" tab={null} crumb="Mileage">
      <p className={m.sub}>
        Business miles in your own car or van, at the HMRC approved rate: {MILEAGE_HIGH_PENCE}p a mile for the first{' '}
        {MILEAGE_BAND_MILES.toLocaleString('en-GB')} miles each driver claims in a tax year, then {MILEAGE_LOW_PENCE}p. Don’t
        claim mileage for a vehicle the business owns: its fuel and running costs go in as expenses instead.
      </p>
      <MileageForm
        today={todayUk()}
        payAccounts={accounts.filter((a) => a.code === personal || isPaymentAccount(a))}
        defaultPay={personal}
      />
    </BooksFrame>
  );
}
