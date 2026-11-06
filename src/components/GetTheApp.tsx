import { IOS_APP_URL } from '@/lib/site';
import s from './GetTheApp.module.css';

/**
 * "Get the iPhone app" for contractors. Hidden in app mode with the rest of
 * the website chrome (data-app-hide), so the app never advertises itself.
 */
export function GetTheApp({
  title = 'Get the iPhone app',
  body = 'New jobs arrive as notifications, and you can price, message customers and send invoices from your phone.',
}: {
  title?: string;
  body?: string;
}) {
  return (
    <aside className={s.card} data-app-hide>
      <span className={s.text}>
        <span className={s.title}>{title}</span>
        {body}
      </span>
      <a href={IOS_APP_URL} className={s.btn} target="_blank" rel="noopener">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 3v13h10V5H7Zm5 14.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
        </svg>
        App Store
      </a>
    </aside>
  );
}
