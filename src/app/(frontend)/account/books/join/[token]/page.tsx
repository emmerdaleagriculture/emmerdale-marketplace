import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getUser } from '@/lib/auth';
import { acceptInvite, inviteByToken } from '@/lib/books/viewers.server';
import a from '../../../../auth.module.css';
import f from '@/components/forms/forms.module.css';

export const metadata: Metadata = { title: 'Shared books', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Where a books invitation lands. Signed in with the invited address, it is
 * accepted and they go straight to the books. Otherwise they sign in, or
 * create an account, and come back here. Nothing happens for a visitor with
 * no session, so a mail scanner opening the link changes nothing.
 */
export default async function JoinBooksPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const here = `/account/books/join/${token}`;
  const invite = await inviteByToken(token);
  const user = await getUser();

  let body: React.ReactNode;
  if (!invite) {
    body = (
      <>
        <h1 className={a.title}>This invitation has been withdrawn</h1>
        <p className={a.sub}>Ask the person who sent it to invite you again from their Books settings.</p>
      </>
    );
  } else if (user) {
    const r = await acceptInvite(token, { id: user.id, email: user.email });
    if (r.ok) redirect(`/account/books/switch?to=${r.ledgerId}`);
    body = (
      <>
        <h1 className={a.title}>Signed in with a different address</h1>
        <p className={a.sub}>
          {invite.ownerName} shared their books with <b>{r.invitedEmail ?? invite.email}</b>, but you’re signed in as <b>{user.email}</b>. Sign
          out, then sign in or create an account with {r.invitedEmail ?? invite.email}. Or ask {invite.ownerName} to invite this address
          instead.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className={f.btnPrimary}>Sign out</button>
        </form>
      </>
    );
  } else {
    const next = encodeURIComponent(here);
    body = (
      <>
        <div className={a.eyebrow}>Shared books</div>
        <h1 className={a.title}>{invite.ownerName} has shared their books with you</h1>
        <p className={a.sub}>
          Read only: the ledger, trial balance, profit and loss, VAT, receipts, invoices and bank, all of which you can download. Sign in,
          or create a free account, with <b>{invite.email}</b>.
        </p>
        <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className={f.btnPrimary} href={`/signup?next=${next}`}>Create an account</Link>
          <Link className={f.btnGhost} href={`/login?next=${next}`}>Sign in</Link>
        </p>
      </>
    );
  }

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>{body}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
