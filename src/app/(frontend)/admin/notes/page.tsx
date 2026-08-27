import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Notes — Admin' };

/** Notes (blog) manager — drafts and published posts, newest first. */
export default async function AdminNotesPage() {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('notes')
    .select('id, slug, title, primary_tag, featured, published, published_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);

  const rows = data ?? [];
  const publishedCount = rows.filter((r) => r.published).length;

  return (
    <div>
      <h1 className={s.h1}>Notes</h1>
      <p className={s.sub}>
        The blog behind <Link href="/notes">/notes</Link>. {publishedCount} published ·{' '}
        {rows.length - publishedCount} draft{rows.length - publishedCount === 1 ? '' : 's'}.
      </p>

      <div className={s.actions}>
        <Link href="/admin/notes/new" className={s.btnApprove}>
          New note
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className={s.empty}>No notes yet — write the first one.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Tag</th>
                <th>Status</th>
                <th>Published</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/notes/${r.id}`}>{r.title}</Link>
                    {r.featured && (
                      <>
                        {' '}
                        <span className={`${s.pill} ${s.pillApproved}`}>featured</span>
                      </>
                    )}
                  </td>
                  <td>{r.primary_tag ?? '—'}</td>
                  <td>
                    {r.published ? (
                      <span className={`${s.pill} ${s.pillApproved}`}>published</span>
                    ) : (
                      <span className={`${s.pill} ${s.pillPending}`}>draft</span>
                    )}
                  </td>
                  <td>{r.published_at ? formatDateTime(r.published_at) : '—'}</td>
                  <td>{formatDateTime(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
