import { ANDROID_APP_URL, IOS_APP_URL } from '@/lib/site';
import s from './GetTheApp.module.css';

/**
 * "Get the app" for contractors, with a button per store. Hidden in app mode
 * with the rest of the website chrome (data-app-hide), so the app never
 * advertises itself.
 */
export function GetTheApp({
  title = 'Get the app',
  body = 'For iPhone and Android. See new jobs, price them, message customers and send invoices from your phone.',
  hide = true,
}: {
  title?: string;
  body?: string;
  hide?: boolean;
}) {
  return (
    <aside className={s.card} {...(hide ? { 'data-app-hide': true } : {})}>
      <span className={s.text}>
        <span className={s.title}>{title}</span>
        {body}
      </span>
      <span className={s.btns}>
        <a href={IOS_APP_URL} className={s.btn} target="_blank" rel="noopener">
          <PhoneIcon />
          App Store
        </a>
        <a href={ANDROID_APP_URL} className={s.btn} target="_blank" rel="noopener">
          <PhoneIcon />
          Google Play
        </a>
      </span>
    </aside>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 3v13h10V5H7Zm5 14.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
    </svg>
  );
}
