import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import { gateWidthLabel } from '@/lib/jobParse/access';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { getServices } from '@/lib/reference';
import { DistributionPanel } from './DistributionPanel';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'Submission — Admin' };

/**
 * Full view of one landing-page submission, including every parse attempt.
 * The diff between what the model said and what the customer confirmed is
 * the eval corpus (spec §5.1) — this page is where that diff is read.
 */
export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createServiceRoleClient();

  const { data: sub } = await admin
    .from('job_submissions')
    .select('*, service:services(name), county:counties(name)')
    .eq('id', id)
    .maybeSingle();
  if (!sub) notFound();

  const { data: parses } = await admin
    .from('job_submission_parses')
    .select('*')
    .eq('submission_id', id)
    .order('created_at', { ascending: true });

  // Distribution state (Part 2): invitations, both-sides prices (§29 — this
  // page and /admin/money are the only places both appear), and the event log.
  const [invitationsQ, quotesQ, eventsQ, services] = await Promise.all([
    admin
      .from('job_invitations')
      .select('id, status, decline_reason, distance_miles, sent_at, opened_at, contractor:contractors(business_name, email)')
      .eq('submission_id', id)
      .order('sent_at', { ascending: true }),
    admin
      .from('client_quotes')
      .select(
        `id, status, client_price_pence, contractor_display_label, contractor_real_name, valid_until, created_at,
         cq:contractor_quotes(contractor_price_pence, quote_type, rate_value_pence, rate_minimum_pence, source, notes_internal, site_visit_required,
           contractor:contractors(business_name))`,
      )
      .eq('submission_id', id)
      .order('created_at', { ascending: true }),
    admin
      .from('job_events')
      .select('event_type, from_status, to_status, actor_type, reason, metadata, created_at')
      .eq('job_id', id)
      .order('created_at', { ascending: true })
      .limit(200),
    getServices(),
  ]);
  const invitations = invitationsQ.data ?? [];
  const allQuotes = quotesQ.data ?? [];
  const events = eventsQ.data ?? [];

  // Private bucket — photos are only ever reachable through short-lived
  // signed URLs minted here for the admin.
  const photoPaths = (sub.photo_paths ?? []) as string[];
  const photos: { path: string; url: string }[] = [];
  for (const path of photoPaths) {
    const { data } = await admin.storage.from('job-photos').createSignedUrl(path, 3600);
    if (data?.signedUrl) photos.push({ path, url: data.signedUrl });
  }

  const service = (sub.service as { name: string } | null)?.name ?? null;
  const county = (sub.county as { name: string } | null)?.name ?? null;
  const missing = (sub.missing_fields ?? []) as string[];
  const alternatives = (sub.service_alternatives ?? []) as string[];

  const fields: [string, string][] = [
    ['Status', sub.status + (sub.confirmed_at ? ` · ${formatDateTime(sub.confirmed_at)}` : '')],
    ['Service', service ?? '(unmatched)'],
    [
      'Classification',
      sub.service_confirmed === null
        ? '—'
        : sub.service_confirmed
          ? 'accepted by customer'
          : 'declined — customer picked/typed their own',
    ],
    ['In their words', sub.service_verbatim ?? '—'],
    ['Alternatives offered', alternatives.length ? alternatives.join(', ') : '—'],
    [
      'Area',
      sub.area_value !== null ? `${sub.area_value} ${sub.area_unit ?? ''} (${sub.area_source})` : '—',
    ],
    [
      'Drawn boundary',
      sub.area_mapped_value !== null
        ? `${sub.area_mapped_value} acres measured${sub.boundary ? ` · ${((sub.boundary as { coordinates?: unknown[][] }).coordinates?.[0]?.length ?? 1) - 1} points` : ''}`
        : 'not drawn',
    ],
    [
      'Conditions',
      Object.entries((sub.service_attributes as Record<string, unknown>) ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ') || '—',
    ],
    ['Postcode', sub.postcode ?? '—'],
    ['County', county ?? '—'],
    ['Lat / lng', sub.lat !== null && sub.lng !== null ? `${sub.lat}, ${sub.lng}` : '—'],
    ['Urgency', (sub.urgency ?? '—') + (sub.target_date ? ` · target ${sub.target_date}` : '')],
    ['Access', sub.access_notes ?? '—'],
    [
      'Gate',
      [gateWidthLabel(sub.gate_width), sub.gate_w3w ? `///${sub.gate_w3w}` : null]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
    ['Obstacles', sub.obstacles ?? '—'],
    ['Contact', sub.contact_name ? `${sub.contact_name} · ${sub.contact_phone ?? '—'} · ${sub.contact_email ?? '—'} (prefers ${sub.contact_preference ?? '—'})` : '—'],
    ['Parse', `${sub.parse_source ?? '—'} · ${sub.model_version ?? 'no model'} · prompt ${sub.prompt_version ?? '—'}`],
    ['Missing after parse', missing.length ? missing.join(', ') : 'nothing'],
    ['Attribution', [sub.utm_source, sub.utm_medium, sub.utm_campaign, sub.gclid ? 'gclid' : null].filter(Boolean).join(' / ') || '—'],
  ];

  return (
    <div>
      <Link href="/admin/submissions" className={s.back}>
        ← All submissions
      </Link>
      <h1 className={s.h1}>{service ?? sub.service_verbatim ?? 'Submission'}</h1>
      <p className={s.sub}>Received {formatDateTime(sub.created_at)}</p>

      <div className={s.detailGrid}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <div className={s.dLabel}>{label}</div>
            <div className={s.dValue}>{value}</div>
          </div>
        ))}
      </div>

      {photos.length > 0 && (
        <>
          <div className={s.sectionLabel}>Photos</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            {photos.map((p) => (
              <a key={p.path} href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.path.includes('access') ? 'Gateway / access' : 'The field'}
                  style={{ width: 180, height: 130, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--rule)' }}
                />
              </a>
            ))}
          </div>
        </>
      )}

      <div className={s.sectionLabel}>Distribution</div>
      <DistributionPanel
        submissionId={sub.id}
        status={sub.status}
        serviceId={sub.service_id}
        services={services}
      />

      {invitations.length > 0 && (
        <>
          <div className={s.sectionLabel}>Invitations ({invitations.length})</div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>Contractor</th><th>Status</th><th>Distance</th><th>Sent</th><th>Opened</th></tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{(inv.contractor as { business_name: string } | null)?.business_name ?? '—'}</td>
                    <td>
                      {inv.status}
                      {inv.decline_reason ? ` (${inv.decline_reason.replace(/_/g, ' ')})` : ''}
                    </td>
                    <td>{inv.distance_miles != null ? `${inv.distance_miles} mi` : '—'}</td>
                    <td>{formatDateTime(inv.sent_at)}</td>
                    <td>{inv.opened_at ? formatDateTime(inv.opened_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {allQuotes.length > 0 && (
        <>
          <div className={s.sectionLabel}>Prices — both sides (never shown elsewhere)</div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Contractor</th>
                  <th>Contractor price</th>
                  <th>Client price</th>
                  <th>Margin</th>
                  <th>Status</th>
                  <th>Notes to us</th>
                </tr>
              </thead>
              <tbody>
                {allQuotes.map((cq) => {
                  const inner = cq.cq as {
                    contractor_price_pence: number;
                    quote_type: string;
                    source: string;
                    notes_internal: string | null;
                    site_visit_required: boolean;
                    contractor: { business_name: string } | null;
                  } | null;
                  return (
                    <tr key={cq.id}>
                      <td>{cq.contractor_display_label}</td>
                      <td>{inner?.contractor?.business_name ?? '—'}</td>
                      <td>
                        {inner ? formatGBP(inner.contractor_price_pence) : '—'}
                        {inner?.quote_type === 'rate' ? ' (rate)' : ''}
                        {inner?.source === 'email_parsed' ? ' · from email' : ''}
                      </td>
                      <td>{formatGBP(cq.client_price_pence)}</td>
                      <td>{inner ? formatGBP(cq.client_price_pence - inner.contractor_price_pence) : '—'}</td>
                      <td>{cq.status}</td>
                      <td>{inner?.notes_internal ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {events.length > 0 && (
        <>
          <div className={s.sectionLabel}>Event log</div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>When</th><th>Event</th><th>Actor</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td>{formatDateTime(e.created_at)}</td>
                    <td>
                      {e.event_type === 'status_change'
                        ? `${e.from_status ?? '·'} → ${e.to_status ?? '·'}`
                        : e.event_type}
                    </td>
                    <td>{e.actor_type}</td>
                    <td>{e.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className={s.sectionLabel}>What they wrote</div>
      <p style={{ whiteSpace: 'pre-wrap', maxWidth: 640 }}>{sub.raw_text}</p>
      {sub.location_raw && (
        <p style={{ color: 'var(--ink-2)' }}>Location field: {sub.location_raw}</p>
      )}

      <div className={s.sectionLabel}>Parse attempts</div>
      {(parses ?? []).length === 0 ? (
        <div className={s.empty}>No parse log rows for this submission.</div>
      ) : (
        (parses ?? []).map((p) => (
          <div key={p.id} style={{ marginBottom: 20 }}>
            <div className={s.dLabel}>
              {formatDateTime(p.created_at)} · {p.parse_source ?? '—'}
              {p.latency_ms !== null ? ` · ${p.latency_ms}ms` : ''}
              {p.error ? ` · error: ${p.error}` : ''}
            </div>
            <pre style={{ fontSize: 12, overflowX: 'auto', background: 'var(--cream)', padding: 12, borderRadius: 6 }}>
              {'Model output:\n'}
              {p.model_output ? JSON.stringify(p.model_output, null, 2) : '(none)'}
              {'\n\nDeterministic output:\n'}
              {JSON.stringify(p.deterministic_output, null, 2)}
            </pre>
          </div>
        ))
      )}
    </div>
  );
}
