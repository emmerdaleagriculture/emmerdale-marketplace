import type { Metadata } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime, timeAgo } from '@/lib/time';
import { setFeedbackHandledAction } from './actions';
import s from '../admin.module.css';
import { AdminTable } from '../ui';

export const metadata: Metadata = { title: 'Feedback — Admin' };
export const dynamic = 'force-dynamic';

/**
 * What people said about using the site.
 *
 * Open first, then everything dealt with, because the list exists to be
 * emptied. Role and page come from the server at submission time, not from
 * the form, so "a contractor said this on the quote page" is a fact rather
 * than a claim — and the path is redacted, so a message sent from a
 * tokenised page shows the screen without handing over the key.
 */
const ROLE_LABEL: Record<string, string> = {
  contractor: 'Contractor',
  customer: 'Customer',
  both: 'Contractor & customer',
  account: 'Signed in',
  visitor: 'Not signed in',
};

type Row = {
  id: string;
  created_at: string;
  message: string;
  email: string | null;
  role: string;
  path: string | null;
  handled_at: string | null;
};

export default async function AdminFeedbackPage() {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('feedback')
    .select('id, created_at, message, email, role, path, handled_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Row[];
  const open = rows.filter((r) => !r.handled_at);
  const done = rows.filter((r) => r.handled_at);

  return (
    <div>
      <h1 className={s.h1}>Feedback</h1>
      <p className={s.sub}>
        From the tab on every page. {open.length} to look at
        {done.length > 0 ? `, ${done.length} dealt with` : ''}.
      </p>

      {error && <div className={s.blocked}>Couldn’t load feedback: {error.message}</div>}

      {open.length === 0 && done.length === 0 && (
        <div className={s.empty}>Nothing yet.</div>
      )}

      {[
        ['To look at', open, false] as const,
        ['Dealt with', done, true] as const,
      ].map(([label, list, handled]) =>
        list.length === 0 ? null : (
          <div key={label}>
            <div className={s.sectionLabel}>{label}</div>
            <AdminTable head={['When', 'Who', 'Page', 'What they said', '']}>
              {list.map((r) => (
                <tr key={r.id}>
                  <td title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}</td>
                  <td>
                    {ROLE_LABEL[r.role] ?? r.role}
                    {r.email && (
                      <>
                        <br />
                        <a href={`mailto:${r.email}`}>{r.email}</a>
                      </>
                    )}
                  </td>
                  <td>{r.path ?? '—'}</td>
                  <td style={{ whiteSpace: 'pre-wrap', maxWidth: 480 }}>{r.message}</td>
                  <td>
                    <form action={setFeedbackHandledAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="handled" value={handled ? 'no' : 'yes'} />
                      <button type="submit" className={handled ? s.btnSuspend : s.btnApprove}>
                        {handled ? 'Reopen' : 'Done'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </AdminTable>
          </div>
        ),
      )}
    </div>
  );
}
