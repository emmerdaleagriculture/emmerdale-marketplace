import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { createClient } from '@/lib/supabase/server';
import { getInbox } from '@/lib/app/inbox';
import { isAppRequest } from '@/lib/appMode.server';
import { AppHero, Seg } from '@/components/app/AppKit';
import { MessageList } from './MessageList';
import a from '../auth.module.css';

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
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const onlyUnread = (await searchParams).v === 'unread';
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
  const unread = threads.filter((t) => t.unread > 0).length;
  const app = await isAppRequest();

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          {app ? (
            <AppHero photo="messages" name={unread > 0 ? `${unread} unread` : 'All caught up'} title="Messages" />
          ) : (
            <h1 className={a.title}>Messages</h1>
          )}
          <Seg
            label="Messages"
            items={[
              { href: '/messages', label: 'All', current: !onlyUnread },
              { href: '/messages?v=unread', label: unread > 0 ? `Unread · ${unread}` : 'Unread', current: onlyUnread },
            ]}
          />
          <MessageList
            key={onlyUnread ? 'unread' : 'all'}
            threads={onlyUnread ? threads.filter((t) => t.unread > 0) : threads}
            empty={
              onlyUnread
                ? 'Nothing unread. You’re all caught up.'
                : contractor.data
                  ? 'No conversations yet. When a customer writes to you about a job you have been invited to price, it appears here.'
                  : 'No conversations yet. Once prices arrive you can message any of the operators from your job page, and the replies land here.'
            }
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
