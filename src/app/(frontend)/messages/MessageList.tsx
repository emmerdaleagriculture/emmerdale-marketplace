'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { InboxThread } from '@/lib/app/inbox';
import s from './messages.module.css';

/**
 * The conversations, with a search box over them: by name, job or message.
 * The list is already loaded, so searching is instant and never a fetch.
 */
export function MessageList({ threads, empty }: { threads: InboxThread[]; empty: string }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return threads;
    return threads.filter((x) => `${x.name} ${x.job} ${x.last.body}`.toLowerCase().includes(t));
  }, [q, threads]);

  return (
    <>
      {threads.length > 0 && (
        <label className={s.search}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" />
          </svg>
          <span className={s.srOnly}>Search messages</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, job or message" autoComplete="off" />
        </label>
      )}
      {shown.length === 0 ? (
        <div className={s.empty}>{threads.length === 0 ? empty : `Nothing matches “${q.trim()}”.`}</div>
      ) : (
        <div className={s.list}>
          {shown.map((t) => (
            <Link key={t.invitationId} href={t.href} className={s.thread}>
              <span className={s.avatar} aria-hidden="true">
                {t.name.replace(/^Operator\s+/i, '').slice(0, 1).toUpperCase()}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className={s.name}>{t.name}</span>
                <span className={s.job}> · {t.job}</span>
                <div className={`${s.last} ${t.unread > 0 ? s.unreadLast : ''}`}>
                  {t.last.mine ? 'You: ' : ''}
                  {t.last.body}
                </div>
              </span>
              <span className={s.meta}>
                <span>{t.last.when}</span>
                {t.unread > 0 && <span className={s.count}>{t.unread}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
