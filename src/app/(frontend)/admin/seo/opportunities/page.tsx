import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { MetaRewriteDraft, NewArticleDraft, OnPageTweakDraft, PageShare } from '@/lib/seoAgent/types';
import { StatusPill, ago } from '../../ui';
import s from '../../admin.module.css';
import styles from '../seo.module.css';
import { decideOpportunityAction } from './actions';

export const metadata: Metadata = {
  title: 'SEO opportunities · Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'open', label: 'To review', statuses: ['pending', 'approved'] },
  { key: 'completed', label: 'Done', statuses: ['completed'] },
  { key: 'rejected', label: 'Rejected', statuses: ['rejected'] },
  { key: 'superseded', label: 'Held back / merged', statuses: ['superseded'] },
] as const;

const TYPE_LABEL: Record<string, string> = {
  meta_rewrite: 'Title / description',
  on_page_tweak: 'On-page addition',
  new_article: 'New article',
};

function pathOf(url: string | null): string {
  if (!url) return '—';
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function Draft({ type, draft, noteId }: { type: string; draft: unknown; noteId: string | null }) {
  if (!draft) return <p className={styles.muted}>No draft (budget or time limit, deferred, or the model returned nothing usable).</p>;
  if (type === 'meta_rewrite') {
    const d = draft as MetaRewriteDraft;
    return (
      <ol>
        {d.alternatives.map((a, i) => (
          <li key={i} style={{ marginBottom: 8 }}>
            <strong>{a.title}</strong> <span className={styles.muted}>({a.title.length})</span>
            <br />
            {a.meta} <span className={styles.muted}>({a.meta.length})</span>
            <br />
            <em className={styles.muted}>{a.rationale}</em>
          </li>
        ))}
      </ol>
    );
  }
  if (type === 'on_page_tweak') {
    const d = draft as OnPageTweakDraft;
    return (
      <div>
        <h4 style={{ margin: '8px 0 4px' }}>{d.newH2}</h4>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{d.newH2Body}</p>
        {d.faqAdditions.length > 0 && (
          <>
            <strong>FAQs</strong>
            <ul>
              {d.faqAdditions.map((f, i) => (
                <li key={i}>
                  <strong>{f.question}</strong> {f.answer}
                </li>
              ))}
            </ul>
          </>
        )}
        {d.internalLinksToAdd.length > 0 && (
          <>
            <strong>Links to add</strong>
            <ul>
              {d.internalLinksToAdd.map((l, i) => (
                <li key={i}>
                  “{l.anchor}” → <a href={l.path}>{l.path}</a> <span className={styles.muted}>({l.reason})</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={styles.muted}>{d.rationale}</p>
      </div>
    );
  }
  const d = draft as NewArticleDraft;
  return (
    <p>
      <strong>{d.title}</strong> · /notes/{d.slug}
      <br />
      <span className={styles.muted}>{d.metaDescription}</span>
      <br />
      {noteId ? (
        <Link href={`/admin/notes/${noteId}`}>Open the unpublished draft note</Link>
      ) : (
        <span className={styles.muted}>The draft note wasn’t created; the text is in the row’s draft_content.</span>
      )}
    </p>
  );
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const db = createServiceRoleClient();
  const { data: rows, error } = await db
    .from('seo_opportunities')
    .select('*')
    .in('status', [...tab.statuses])
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>SEO opportunities</h1>
          <p className={styles.range}>
            Raised by the monthly agent (1st of the month, 07:00 UTC) from Search Console. Each decision starts a
            120-day cooldown on that query; done items are re-measured in the digest after 6 weeks.
          </p>
        </div>
      </header>

      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 0 16px' }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`?tab=${t.key}`} aria-current={t.key === tab.key ? 'page' : undefined} style={{ fontWeight: t.key === tab.key ? 700 : 400 }}>
            {t.label}
          </Link>
        ))}
      </nav>

      {error && (
        <section className={styles.error}>
          <h2>Couldn’t load opportunities</h2>
          <pre>{error.message}</pre>
        </section>
      )}

      {!error && (rows ?? []).length === 0 && <p className={styles.muted}>Nothing here.</p>}

      {(rows ?? []).map((r) => {
        const competing = (r.competing_pages as PageShare[] | null) ?? [];
        const related = (r.related_queries as Array<{ query: string }> | null) ?? [];
        return (
          <section key={r.id} className={s.card} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17 }}>
                  “{r.query}” <StatusPill status={r.status} />
                </h2>
                <p className={styles.muted} style={{ margin: '4px 0' }}>
                  #{r.id} · {TYPE_LABEL[r.type] ?? r.type} · {r.intent ?? '—'} · {r.week_identified} · raised {ago(r.created_at)}
                </p>
                <p style={{ margin: '4px 0' }}>
                  {r.target_url ? <a href={r.target_url}>{pathOf(r.target_url)}</a> : 'New page'} · pos{' '}
                  {Number(r.position ?? 0).toFixed(1)} · {r.impressions} impr · {r.clicks} clicks · CTR{' '}
                  {(Number(r.ctr ?? 0) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            {related.length > 0 && <p style={{ margin: '4px 0' }}>Also covers: {related.map((q) => q.query).join(', ')}</p>}
            {competing.length > 0 && (
              <p style={{ margin: '4px 0', color: '#a35b00' }}>
                ⚠ Split: Google also shows {competing.map((p) => `${pathOf(p.page)} (${p.impressions} impr)`).join(', ')}
              </p>
            )}
            <p className={styles.muted} style={{ whiteSpace: 'pre-wrap' }}>{r.rationale}</p>
            <Draft type={r.type} draft={r.draft_content} noteId={r.related_note_id} />
            {r.review_notes && <p style={{ whiteSpace: 'pre-wrap' }}><strong>Notes:</strong> {r.review_notes}</p>}

            {r.status !== 'superseded' && (
              <form action={decideOpportunityAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                <input type="hidden" name="id" value={r.id} />
                <input name="note" placeholder="Note (optional)" style={{ flex: '1 1 200px', padding: 6 }} />
                {r.status === 'pending' && (
                  <button type="submit" name="decision" value="approve" className={s.btnApprove}>Approve</button>
                )}
                {(r.status === 'pending' || r.status === 'approved') && (
                  <>
                    <button type="submit" name="decision" value="complete" className={s.btnApprove}>Mark done</button>
                    <button type="submit" name="decision" value="reject" className={s.btnSuspend}>Reject</button>
                  </>
                )}
                {(r.status === 'completed' || r.status === 'rejected') && (
                  <button type="submit" name="decision" value="reopen" className={s.btnSuspend}>Reopen</button>
                )}
              </form>
            )}
          </section>
        );
      })}
    </main>
  );
}
