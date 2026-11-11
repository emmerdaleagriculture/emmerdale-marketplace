import type { Metadata } from 'next';
import Link from 'next/link';
import { loadSentryIssueDetail } from '@/lib/sentry/issues';
import s from '../../admin.module.css';
import { AdminTable, Tile, Tiles, ago } from '../../ui';

export const metadata: Metadata = { title: 'Error · Admin' };
export const dynamic = 'force-dynamic';

/**
 * One Sentry issue, readable without leaving the admin: which pages, browsers
 * and releases its events came from, and the latest event's stack and
 * breadcrumbs. The list page shows only a title and a culprit, which for a
 * browser error ("Event captured as promise rejection") says nothing about
 * where it happened. The token stays on the server.
 */
export default async function ErrorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadSentryIssueDetail(id);

  if (!d.configured || !d.ok) {
    return (
      <div>
        <p><Link href="/admin/errors">← Errors</Link></p>
        <div className={s.empty}>
          {d.configured ? `Could not read this issue from Sentry: ${d.error}.` : 'Sentry is not readable from here (no SENTRY_READ_TOKEN).'}
        </div>
      </div>
    );
  }

  const { issue, event, spread } = d;
  return (
    <div>
      <p><Link href="/admin/errors">← Errors</Link></p>
      <h1 className={s.h1}>{issue.title}</h1>
      <p className={s.sub}>
        <code>{issue.culprit ?? '—'}</code>
        {issue.permalink && (
          <>
            {' · '}
            <a href={issue.permalink} target="_blank" rel="noreferrer">Open in Sentry</a>
          </>
        )}
      </p>

      <Tiles>
        <Tile value={issue.count} label="Events" hint="all time" />
        <Tile value={issue.userCount} label="People" hint="identified users" />
        <Tile value={ago(issue.firstSeen)} label="First seen" />
        <Tile value={ago(issue.lastSeen)} label="Last seen" />
      </Tiles>

      <div className={s.sectionLabel}>Where its events came from</div>
      {spread.length === 0 ? (
        <div className={s.empty}>Sentry returned no tag breakdown for this issue.</div>
      ) : (
        <AdminTable head={['Tag', 'Values (events)']}>
          {spread.map((t) => (
            <tr key={t.key}>
              <td><code>{t.key}</code></td>
              <td>
                {t.values.map((v) => (
                  <div key={v.value} style={{ overflowWrap: 'anywhere' }}>
                    {v.value} <span className={s.metricHint}>×{v.count}</span>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      <div className={s.sectionLabel}>Latest event</div>
      {!event ? (
        <div className={s.empty}>Sentry returned no events for this issue.</div>
      ) : (
        <>
          <AdminTable>
            <tr><td>When</td><td>{event.at ? `${new Date(event.at).toLocaleString('en-GB', { timeZone: 'Europe/London' })} (${ago(event.at)})` : '—'}</td></tr>
            <tr><td>Page</td><td style={{ overflowWrap: 'anywhere' }}>{event.url ?? '—'}</td></tr>
            <tr><td>Release</td><td><code>{event.release ?? '—'}</code></td></tr>
            {event.tags
              .filter((t) => !['url', 'release'].includes(t.key))
              .map((t) => (
                <tr key={t.key}><td><code>{t.key}</code></td><td style={{ overflowWrap: 'anywhere' }}>{t.value}</td></tr>
              ))}
          </AdminTable>

          <div className={s.sectionLabel}>Stack (where it threw first)</div>
          {event.exceptions.length === 0 ? (
            <div className={s.empty}>No exception recorded on this event.</div>
          ) : (
            event.exceptions.map((x, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <p><strong>{x.type ?? 'Error'}</strong>: {x.value ?? ''}</p>
                {x.frames.length === 0 ? (
                  <div className={s.empty}>No stack frames: thrown by something outside our scripts, or not an Error at all.</div>
                ) : (
                  <AdminTable head={['Function', 'File', 'Ours']}>
                    {x.frames.slice(0, 25).map((f, j) => (
                      <tr key={j}>
                        <td><code>{f.fn ?? '?'}</code></td>
                        <td style={{ overflowWrap: 'anywhere' }}>
                          <code>{f.file ?? '?'}{f.line != null ? `:${f.line}${f.col != null ? `:${f.col}` : ''}` : ''}</code>
                        </td>
                        <td>{f.inApp ? 'yes' : ''}</td>
                      </tr>
                    ))}
                  </AdminTable>
                )}
              </div>
            ))
          )}

          <div className={s.sectionLabel}>Breadcrumbs (last 20)</div>
          {event.breadcrumbs.length === 0 ? (
            <div className={s.empty}>None.</div>
          ) : (
            <AdminTable head={['When', 'Kind', 'What']}>
              {event.breadcrumbs.map((b, i) => (
                <tr key={i}>
                  <td>{b.at ? new Date(b.at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' }) : '—'}</td>
                  <td><code>{b.category ?? '—'}</code></td>
                  <td style={{ overflowWrap: 'anywhere' }}>{b.message ?? ''}</td>
                </tr>
              ))}
            </AdminTable>
          )}

          <div className={s.sectionLabel}>Context and extra data</div>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, background: '#fff', border: '1px solid var(--rule)', padding: 12 }}>
            {JSON.stringify(event.raw, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
