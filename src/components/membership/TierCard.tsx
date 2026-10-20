import type { MouseEvent, ReactNode } from 'react';
import { annualSaving, MEMBERSHIP_NAMES, MEMBERSHIP_PRICES, type MembershipTier } from '@/lib/membership';
import s from './tierCard.module.css';

/**
 * The membership tiers as cards, shared by the membership page (where the
 * foot holds Stripe buttons) and the application form (where it holds the
 * pick). One place for the names, prices, blurbs and benefits, so the two
 * pages make the same offer in the same words.
 */

/** Free is not a MembershipTier — nothing is billed — but it is a card. */
export type CardTier = MembershipTier | 'free';

export const gbp = (n: number) => `£${n}`;

export const PREMIUM_BENEFITS: ReactNode[] = [
  <><b>First refusal on new jobs</b> in your area, for up to 7 days before the rest of the market sees them.</>,
  <><b>5% commission instead of 15%.</b> Price a job at £400 and the customer sees £420, not £460.</>,
  <><b>Cancel any time.</b> You keep it to the end of the period you’ve paid for.</>,
];
export const OPEN_BENEFITS: ReactNode[] = [
  <><b>First look ahead of Premium.</b> New jobs reach Open members up to 2 hours before Premium members in the same area.</>,
  <><b>The customer’s name, phone and email</b> on every job you’re invited to, the moment it arrives.</>,
  <><b>Agree the work directly</b> with nothing added on top — or send a price through us at 5% as usual.</>,
  <><b>A listing on our county pages</b>, with a link to your website and customers’ enquiries sent straight to you.</>,
  <><b>Market data for your area:</b> jobs month by month, what each kind of work goes for, and your win rate against the field.</>,
];
export const FREE_BENEFITS: ReactNode[] = [
  <><b>Every job in your area</b> once members have had first refusal.</>,
  <><b>15% commission.</b> Price a job at £400 and the customer sees £460.</>,
  <><b>Nothing to pay</b>, no card, no commitment.</>,
];

const BLURB: Record<CardTier, string> = {
  free: 'Every job in your area after members have seen it, at our standard commission.',
  premium: 'Every job in your area ahead of the market, and 5% commission instead of 15%.',
  open: 'Everything in Premium, plus the customer’s contact details on every job.',
};
const GLYPH: Record<CardTier, string> = { free: '', premium: '★ ', open: '◆ ' };

function Tick() {
  return (
    <svg className={s.tick} viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

export function Benefits({ items, plus, flush = false }: { items: ReactNode[]; plus?: string; flush?: boolean }) {
  return (
    <ul className={flush ? `${s.benefits} ${s.benefitsFlush}` : s.benefits}>
      {plus && <li className={s.plus}>{plus}</li>}
      {items.map((b, i) => (
        <li key={i} className={s.benefit}>
          <Tick />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

/** The grid the three cards sit in. */
export function TierGrid({ children }: { children: ReactNode }) {
  return <div className={s.tiers}>{children}</div>;
}

/**
 * One card. `current` paints it green (theirs, or their pick); `tag` is the
 * pill on its top edge; Open is the featured card unless it is current.
 * `onSelect` makes the whole card clickable — clicks on a control inside
 * are left to the control.
 */
export function TierCard({
  tier,
  current = false,
  tag,
  onSelect,
  children,
}: {
  tier: CardTier;
  current?: boolean;
  tag?: string;
  onSelect?: () => void;
  children: ReactNode;
}) {
  const featured = tier === 'open' && !current;
  const price = tier === 'free' ? null : MEMBERSHIP_PRICES[tier];
  const name = tier === 'free' ? 'Free' : MEMBERSHIP_NAMES[tier];
  const click = onSelect
    ? (e: MouseEvent<HTMLElement>) => {
        if ((e.target as HTMLElement).closest('label, button, a, input')) return;
        onSelect();
      }
    : undefined;
  return (
    <article
      className={[s.tier, current ? s.tierCurrent : featured ? s.tierFeatured : '', onSelect ? s.tierClickable : '']
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={`tier-${tier}`}
      onClick={click}
    >
      {tag ? (
        <span className={current ? `${s.tierTag} ${s.tagCurrent}` : s.tierTag}>{tag}</span>
      ) : featured ? (
        <span className={s.tierTag}>Deal direct</span>
      ) : null}
      <h2 id={`tier-${tier}`} className={s.tierName}>{GLYPH[tier]}{name}</h2>
      <p className={s.tierBlurb}>{BLURB[tier]}</p>
      <p className={s.price}>
        <span className={s.priceAmount}>{gbp(price?.monthly ?? 0)}</span>
        <span className={s.pricePer}>a month</span>
      </p>
      {tier === 'free' ? (
        <p className={s.priceAlt}>and nothing a year either</p>
      ) : (
        <p className={s.priceAlt}>
          or {gbp(price!.annual)} a year — <b>save {gbp(annualSaving(tier))}</b>
        </p>
      )}
      {tier === 'open' ? (
        <Benefits plus="Everything in Premium, plus" items={OPEN_BENEFITS} />
      ) : (
        <Benefits items={tier === 'premium' ? PREMIUM_BENEFITS : FREE_BENEFITS} />
      )}
      <div className={s.actions}>{children}</div>
    </article>
  );
}

/** The foot's two plain states, for pages that have nothing to press. */
export function ActionNote({ children }: { children: ReactNode }) {
  return <p className={s.actionNote}>{children}</p>;
}
export function ActionCurrent({ children }: { children: ReactNode }) {
  return <span className={s.actionCurrent}>{children}</span>;
}
