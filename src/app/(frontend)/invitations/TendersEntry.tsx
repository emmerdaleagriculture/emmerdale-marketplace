'use client';

import Link from 'next/link';
import { openInAppBrowser } from '@/lib/app/browser';
import s from './invitations.module.css';

type Props = {
  /** 'open': link to the list. 'upgrade-web': link to the tiers.
   *  'upgrade-app': open the website's tiers page in the system browser. */
  mode: 'open' | 'upgrade-web' | 'upgrade-app';
  fresh: number;
};

const Body = ({ mode, fresh }: Props) => (
  <>
    <span className={s.tendersText}>
      <span className={s.tendersTitle}>Council tenders</span>
      <span className={s.meta}>
        {mode === 'open'
          ? 'Public contracts for land work on your patch, checked every morning.'
          : 'Public contracts for land work on your patch. Part of Open membership.'}
      </span>
    </span>
    <span className={s.tendersValue}>
      {mode === 'open' && fresh > 0 ? `${fresh} new` : mode === 'upgrade-app' ? 'On the website' : null}
      <svg className={s.chevron} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  </>
);

/** The top of the Jobs list: council work for Open members, the way to Open for everyone else. */
export function TendersEntry(props: Props) {
  if (props.mode === 'open') {
    return (
      <Link href="/account/tenders" className={`${s.card} ${s.tenders}`}>
        <Body {...props} />
      </Link>
    );
  }
  if (props.mode === 'upgrade-web') {
    return (
      <Link href="/account/membership" className={`${s.card} ${s.tenders}`}>
        <Body {...props} />
      </Link>
    );
  }
  // In the app: membership is bought on the website, so it opens there.
  return (
    <button
      type="button"
      className={`${s.card} ${s.tenders}`}
      onClick={() => void openInAppBrowser(`${window.location.origin}/account/membership`)}
    >
      <Body {...props} />
    </button>
  );
}
