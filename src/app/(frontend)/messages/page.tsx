import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { createClient } from '@/lib/supabase/server';
import { getInbox } from '@/lib/app/inbox';
import a from '../auth.module.css';
import s from './messages.module.css';

export const metadata: Metadata = { title: 'Messages', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * One list of every conversation, for the app's Messages tab. Reading and
 * replying stay where they were — the customer's job page, the contractor's
 * price page — and this is the way to them. Works on the website too, with
 * the site header; nothing links to it there yet.
 *
 * Someone who is both a contractor and a customer sees both sets, the
 * contractor ones first, as the tab bar is the contractor's.
 */
export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/messages');

  const [contractor, customer] = await Promise.all([
    supabase.from('contractors').select('id').eq('id', user.id).maybeSingle(),
    supabase.from('customers').select('id').eq('id', user.id).maybeSingle(),
  ]);
  if (!contractor.data && !customer.data) redirect('/account');

  const [asContractor, asCustomer] = await Promise.all([
    contractor.data ? getInbox(user.id, 'contractor') : Promise.resolve([]),
    customer.data ? getInbox(user.id, 'customer') : Promise.resolve([]),
  ]);
  const threads = [...asContractor, ...asCustomer];

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <h1 className={a.title}>Messages</h1>
          {threads.length === 0 ? (
            <div className={s.empty}>
              {contractor.data
                ? 'No conversations yet. When a customer writes to you about a job you have been invited to price, it appears here.'
                : 'No conversations yet. Once prices arrive you can message any of the operators from your job page, and the replies land here.'}
            </div>
          ) : (
            <div className={s.list}>
              {threads.map((t) => (
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
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
