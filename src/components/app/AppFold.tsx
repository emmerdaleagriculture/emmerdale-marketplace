import type { CSSProperties, ReactNode } from 'react';
import a from '@/app/(frontend)/auth.module.css';
import s from './appFold.module.css';

/**
 * A secondary list (past invitations, jobs already opened) that folds into
 * a closed drawer in the app, so the work that needs an answer stays on the
 * first screen. On the website it stays a plain section under a group title.
 *
 * `inApp` comes from isAppRequest() on the server, so the drawer arrives
 * closed rather than snapping shut after load.
 */
export function AppFold({
  inApp,
  title,
  count,
  titleStyle,
  children,
}: {
  inApp: boolean;
  title: string;
  count: number;
  titleStyle?: CSSProperties;
  children: ReactNode;
}) {
  if (!inApp) {
    return (
      <>
        <div className={a.groupTitle} style={titleStyle}>
          {title}
        </div>
        {children}
      </>
    );
  }
  return (
    <details className={s.drawer}>
      <summary className={s.drawerHead}>
        {title}
        <span className={s.drawerCount}>{count}</span>
      </summary>
      <div className={s.drawerBody}>{children}</div>
    </details>
  );
}
