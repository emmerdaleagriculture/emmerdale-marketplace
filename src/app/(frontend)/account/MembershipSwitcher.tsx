import type { Membership } from '@/lib/membership';
import { switchMembershipAction } from './switchActions';
import f from '@/components/forms/forms.module.css';
import ac from './account.module.css';

const OPTIONS = [
  { value: 'none', label: 'Free' },
  { value: 'premium', label: 'Premium' },
  { value: 'open', label: 'Open' },
] as const;

/** The tier switch for accounts in MEMBERSHIP_SWITCHERS. Plain form, no JS needed. */
export function MembershipSwitcher({ current, billed }: { current: Membership; billed: boolean }) {
  const now = current ?? 'none';
  return (
    <form action={switchMembershipAction} className={ac.switcher}>
      <span className={f.hint}>
        Switch membership (test account){billed ? ': a live Stripe subscription overrides this' : ''}
      </span>
      <div className={f.chips}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="submit"
            name="tier"
            value={o.value}
            className={f.chip}
            aria-pressed={now === o.value}
            disabled={now === o.value}
          >
            {now === o.value ? `✓ ${o.label}` : o.label}
          </button>
        ))}
      </div>
    </form>
  );
}
