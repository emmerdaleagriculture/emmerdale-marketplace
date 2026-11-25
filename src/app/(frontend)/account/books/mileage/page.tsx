import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAccounts, loadLedger, businessTypeOf } from '@/lib/books/server';
import { isBankAccount, personalAccountCode } from '@/lib/books/chart';
import { MILEAGE_BAND_MILES, MILEAGE_HIGH_PENCE, MILEAGE_LOW_PENCE, type OpenTrip } from '@/lib/books/mileage';
import { todayUk, ukDate } from '@/lib/books/period';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { discardMileageTripAction } from '../actions';
import { MileageForm } from './MileageForm';

export const metadata: Metadata = { title: 'Claim mileage', robots: { index: false, follow: false } };

const reading = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 1 });

export default async function MileagePage({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const access = await loadLedger('/account/books/mileage');
  if (!access.canEdit) redirect('/account/books');
  const { trip: tripParam } = await searchParams;
  const [accounts, { data: tripRows }] = await Promise.all([
    getAccounts(access.ledger.id),
    createServiceRoleClient()
      .from('books_mileage_trips')
      .select('id, trip_date, driver, odometer_start, journey, purpose, pay_code')
      .eq('ledger_id', access.ledger.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  const trips: OpenTrip[] = (tripRows ?? []).map((t) => ({
    id: t.id,
    date: t.trip_date,
    driver: t.driver,
    odometerStart: Number(t.odometer_start),
    journey: t.journey ?? '',
    purpose: t.purpose ?? '',
    payCode: t.pay_code,
  }));
  // A started trip is what the driver has come back for: with only one, open
  // it straight away. ?trip=new asks for a blank form instead.
  const open =
    tripParam === 'new' ? null : (trips.find((t) => String(t.id) === tripParam) ?? (tripParam === undefined && trips.length === 1 ? trips[0] : null));
  const others = trips.filter((t) => t.id !== open?.id);
  const personal = personalAccountCode(businessTypeOf(access.ledger));
  const payAccounts = accounts.filter((a) => a.code === personal || isBankAccount(a));
  return (
    <BooksFrame access={access} title="Claim mileage" tab={null} crumb="Mileage">
      <p className={m.sub}>
        Business miles in your own car or van, at the HMRC approved rate: {MILEAGE_HIGH_PENCE}p a mile for the first{' '}
        {MILEAGE_BAND_MILES.toLocaleString('en-GB')} miles each driver claims in a tax year, then {MILEAGE_LOW_PENCE}p. Don’t
        claim mileage for a vehicle the business owns: its fuel and running costs go in as expenses instead.
      </p>
      {open && (
        <div className={s.notice}>
          <b>Finishing the trip started {ukDate(open.date)}</b> at {reading(open.odometerStart)} miles ({open.driver}). Add the
          odometer reading at the finish to claim it.
          <div className={s.tripActions}>
            <Link href="/account/books/mileage?trip=new">Claim a different trip</Link>
            <form action={discardMileageTripAction}>
              <input type="hidden" name="trip_id" value={open.id} />
              <button className={s.linkButton} type="submit">
                Discard this trip
              </button>
            </form>
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div className={s.notice}>
          <b>{open ? 'Other trips started' : `Trip${others.length === 1 ? '' : 's'} started, waiting for a finish reading`}</b>
          <ul className={s.tripList}>
            {others.map((t) => (
              <li key={t.id}>
                <span>
                  {ukDate(t.date)} · {t.driver} · started at {reading(t.odometerStart)}
                  {t.journey ? ` · ${t.journey}` : ''}
                </span>
                <Link href={`/account/books/mileage?trip=${t.id}`}>Add finish reading</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <MileageForm
        // A different trip is a different form: remount so its fields refill.
        key={open?.id ?? 'new'}
        today={todayUk()}
        payAccounts={payAccounts}
        defaultPay={open?.payCode && payAccounts.some((a) => a.code === open.payCode) ? open.payCode : personal}
        trip={open}
      />
    </BooksFrame>
  );
}
