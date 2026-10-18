import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { LogoutButton } from '@/components/app/PushControls';
import ui from '../../app-ui.module.css';

export const metadata: Metadata = { title: 'We’re checking your details', robots: { index: false, follow: false } };

/** After applying: what happens next, and nothing to do until it does. */
export default async function ApplyDonePage() {
  const user = await getUser();
  if (!user) redirect('/app');
  const { data: c } = await createServiceRoleClient().from('contractors').select('status, business_name').eq('id', user.id).maybeSingle();
  if (!c) redirect('/app/apply');
  if (c.status === 'approved') redirect('/invitations');
  return (
    <main className={ui.screen}>
      <div style={{ display: 'grid', placeItems: 'center', padding: '40px 0 16px' }}>
        <span className={ui.avatar} style={{ width: 96, height: 96, borderRadius: 28, fontSize: 40 }} aria-hidden="true">
          ✓
        </span>
      </div>
      <h1 className={ui.title} style={{ textAlign: 'center' }}>
        We&rsquo;re checking your details
      </h1>
      <p style={{ textAlign: 'center', color: 'var(--ink-2)', lineHeight: 1.55 }}>
        Thanks, {c.business_name}. We look at every application by hand, usually within a few hours
        on a working day. You&rsquo;ll get a notification and a text the moment you&rsquo;re approved, and
        jobs near you will start appearing here.
      </p>
      <ul className={ui.promises} style={{ marginTop: 22 }}>
        <li className={ui.promise}>
          <span className={ui.tick} aria-hidden="true">✓</span>
          <span><strong>Insurance checked.</strong> We confirm the certificate is current.</span>
        </li>
        <li className={ui.promise}>
          <span className={ui.tick} aria-hidden="true">✓</span>
          <span><strong>Jobs come to you.</strong> First come, first served, in the area you cover.</span>
        </li>
        <li className={ui.promise}>
          <span className={ui.tick} aria-hidden="true">✓</span>
          <span><strong>Paid through us.</strong> The customer pays a deposit to book and the balance on sign-off.</span>
        </li>
      </ul>
      <p className={ui.note} style={{ textAlign: 'center' }}>
        Questions? <Link href="/contact">Contact us</Link>.
      </p>
      <div style={{ marginTop: 24 }}>
        <LogoutButton className={`${ui.btn} ${ui.btnGhost}`} />
      </div>
    </main>
  );
}
