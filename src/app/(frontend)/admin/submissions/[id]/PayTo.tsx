import { onHold } from '@/lib/bankDetails';

type Bank = {
  account_name: string;
  sort_code: string;
  account_number: string;
  hold_until: string | null;
  updated_at: string;
  changed_count: number;
} | null;

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The account to pay, for the payout made by hand. A change in the last
 * 72 hours is on hold: the contractor was emailed, but a swapped account is
 * how payouts get stolen, so check by phone before paying into it.
 */
export function PayTo({ bank }: { bank: Bank }) {
  if (!bank) {
    return <p style={{ margin: '0 0 10px' }}>No bank details on file: use the ones on their invoice, and check them by phone.</p>;
  }
  const held = onHold(bank.hold_until);
  const recent = Date.now() - new Date(bank.updated_at).getTime() < 14 * 86400_000 && bank.changed_count > 0;
  return (
    <div style={{ margin: '0 0 12px' }}>
      {held ? (
        <p role="alert" style={{ margin: '0 0 8px', padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, #c23b2c 12%, transparent)', color: 'var(--error)', fontWeight: 600 }}>
          Bank details changed {when(bank.updated_at)}. On hold until {when(bank.hold_until!)}: don’t pay into this account before then, and
          call the contractor on a number you already had to check it’s them.
        </p>
      ) : (
        recent && (
          <p style={{ margin: '0 0 8px', color: 'var(--ink-2)' }}>
            Changed {when(bank.updated_at)} (hold over). Worth a quick call if this is the first payout since.
          </p>
        )
      )}
      <div style={{ fontVariantNumeric: 'tabular-nums' }}>
        Pay <strong>{bank.account_name}</strong> · {bank.sort_code} · {bank.account_number}
      </div>
    </div>
  );
}
