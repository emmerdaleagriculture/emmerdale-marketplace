import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import { gateWidthLabel } from '@/lib/jobParse/access';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { getServices } from '@/lib/reference';
import { DistributionPanel } from './DistributionPanel';
import { ClearNoteButton } from './ClearNoteButton';
import { DeleteJobButton } from './DeleteJobButton';
import { ExtraWorkForm } from './ExtraWorkForm';
import s from '../../admin.module.css';
import { AdminTable } from '../../ui';
import p from '../submissions.module.css';
import { OutreachList, OutreachStats, STAGE_TITLES, isOutreachStage, type OutreachStage } from '../OutreachStats';
import { loadOutreach } from '../outreach';

export const metadata: Metadata = { title: 'Submission — Admin' };

/**
 * Full view of one landing-page submission, including every parse attempt.
 * The diff between what the model said and what the customer confirmed is
 * the eval corpus (spec §5.1) — this page is where that diff is read.
 */
export default async function SubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
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
  const [outreach, quotesQ, eventsQ, services, messagesQ] = await Promise.all([
    loadOutreach(id),
    admin
      .from('client_quotes')
      .select(
        `id, status, client_price_pence, contractor_display_label, contractor_real_name, valid_until, created_at, contractor_note,
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
    // Customer↔contractor threads, read-only here.
    admin
      .from('job_messages')
      .select(
        `id, sender, body, phase, created_at, read_at,
         inv:job_invitations(display_label, contractor:contractors(business_name))`,
      )
      .eq('submission_id', id)
      .order('created_at', { ascending: true })
      .limit(500),
  ]);
  const messages = messagesQ.data ?? [];

  // Extra work: jobs booked off this one, and the one this extends.
  const [extrasQ, contractorQ, markupQ] = await Promise.all([
    admin
      .from('job_submissions')
      .select('id, service_verbatim, status, created_at')
      .eq('extra_work_of', id)
      .order('created_at'),
    sub.awarded_contractor_id
      ? admin.from('contractors').select('business_name').eq('id', sub.awarded_contractor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('app_config').select('value').eq('key', 'sq_markup_rate').maybeSingle(),
  ]);
  const extras = extrasQ.data ?? [];
  const markupRate = Number(markupQ.data?.value ?? 0.1);
  const booked = [
    'awarded', 'contacted', 'scheduled', 'in_progress',
    'completed_by_contractor', 'completed', 'paid',
  ].includes(sub.status);
  const allQuotes = quotesQ.data ?? [];
  const events = eventsQ.data ?? [];
  const show: OutreachStage = isOutreachStage(sp.show) ? sp.show : 'emailed';

  // Private bucket — photos are only ever reachable through short-lived
  // signed URLs minted here for the admin.
  // The contractor's invoice for the payout, same private-bucket treatment.
  // Every movement of money on the job: the deposit, and after sign-off the
  // balance — with where the worker has got to on it, which is the question
  // an operator opening a finished job is usually here to answer.
  const { data: payments } = await admin
    .from('job_payments')
    .select('id, kind, status, amount_pence, paid_at, due_at, attempts, last_error')
    .eq('submission_id', id)
    .order('created_at', { ascending: true });

  let invoiceUrl: string | null = null;
  if (sub.contractor_invoice_path) {
    const { data } = await admin.storage
      .from('contractor-invoices')
      .createSignedUrl(sub.contractor_invoice_path, 3600);
    invoiceUrl = data?.signedUrl ?? null;
  }

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

      {(payments?.length ?? 0) > 0 && (
        <>
          <div className={s.sectionLabel}>Payments</div>
          <AdminTable head={['Part', 'Amount', 'Status', 'When']}>
            {payments!.map((p) => (
              <tr key={p.id}>
                <td>{p.kind === 'balance' ? 'Balance' : 'Deposit'}</td>
                <td>{formatGBP(p.amount_pence)}</td>
                <td title={p.last_error ?? undefined}>
                  {p.status}
                  {p.kind === 'balance' && p.status === 'due' && p.attempts > 0
                    ? ` (retrying — ${p.attempts} so far)`
                    : ''}
                  {p.status === 'failed' ? ' — customer asked to pay from their job page' : ''}
                </td>
                <td>
                  {p.paid_at
                    ? `paid ${new Date(p.paid_at).toLocaleString('en-GB')}`
                    : p.due_at
                      ? `due ${new Date(p.due_at).toLocaleDateString('en-GB')}`
                      : '—'}
                </td>
              </tr>
            ))}
          </AdminTable>
        </>
      )}

      {['completed', 'paid'].includes(sub.status) && (
        <>
          <div className={s.sectionLabel}>Contractor invoice</div>
          <div className={s.empty}>
            {invoiceUrl ? (
              <>
                <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
                  {sub.contractor_invoice_name ?? 'Invoice'}
                </a>{' '}
                — sent{' '}
                {sub.contractor_invoice_at
                  ? new Date(sub.contractor_invoice_at).toLocaleString('en-GB')
                  : ''}
                . Link is good for an hour.
              </>
            ) : (
              <>Not sent yet. The job is finished; the payout is due once the balance above has cleared and the invoice is in.</>
            )}
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

      {(booked || extras.length > 0 || sub.extra_work_of) && (
        <>
          <div className={s.sectionLabel}>Extra work</div>
          {sub.extra_work_of && (
            <p className={s.sub}>
              This is extra work on{' '}
              <Link href={`/admin/submissions/${sub.extra_work_of}`}>
                {sub.extra_work_of.slice(0, 8)}
              </Link>
              .
            </p>
          )}
          {extras.length > 0 && (
            <AdminTable head={['Added', 'Extra work', 'Status']}>
              {extras.map((x) => (
                <tr key={x.id}>
                  <td>{formatDateTime(x.created_at)}</td>
                  <td>
                    <Link href={`/admin/submissions/${x.id}`}>{x.service_verbatim ?? x.id.slice(0, 8)}</Link>
                  </td>
                  <td>{x.status}</td>
                </tr>
              ))}
            </AdminTable>
          )}
          {booked && (
            <ExtraWorkForm
              submissionId={sub.id}
              contractorName={contractorQ.data?.business_name ?? 'the contractor'}
              markupRate={markupRate}
            />
          )}
        </>
      )}

      {outreach.lines.emailed.length > 0 && (
        <>
          <div id="outreach" className={s.sectionLabel}>
            Outreach — {outreach.counts.invited} invited
          </div>
          <OutreachStats id={sub.id} counts={outreach.counts} active={show} />
          <div className={p.stageTitle}>{STAGE_TITLES[show]}</div>
          <OutreachList stage={show} lines={outreach.lines[show]} />
        </>
      )}

      {allQuotes.length > 0 && (
        <>
          <div className={s.sectionLabel}>Prices — both sides (never shown elsewhere)</div>
          <AdminTable head={['Label', 'Contractor', 'Contractor price', 'Client price', 'Margin', 'Status', 'Note to the customer', 'Notes to us (historic)']}>
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
                  {/* Nothing reviews this before the customer reads it,
                      so the only control is taking it back afterwards. */}
                  <td>
                    {cq.contractor_note ? (
                      <>
                        “{cq.contractor_note}”
                        <ClearNoteButton submissionId={id} clientQuoteId={cq.id} />
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{inner?.notes_internal ?? '—'}</td>
                </tr>
              );
            })}
          </AdminTable>
        </>
      )}

      {messages.length > 0 && (
        <>
          <div className={s.sectionLabel} id="messages">Messages — customer and contractors</div>
          <AdminTable head={['When', 'Thread', 'From', 'Message', 'Read']}>
            {messages.map((msg) => {
              const inv = msg.inv as {
                display_label: string | null;
                contractor: { business_name: string } | null;
              } | null;
              return (
                <tr key={msg.id}>
                  <td>{formatDateTime(msg.created_at)}</td>
                  <td>
                    {inv?.display_label ?? '—'}
                    {inv?.contractor?.business_name ? ` · ${inv.contractor.business_name}` : ''}
                  </td>
                  <td>
                    {msg.sender === 'client' ? 'Customer' : 'Contractor'}
                    {msg.phase === 'pre_award' ? ' (before award)' : ''}
                  </td>
                  <td style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{msg.body}</td>
                  <td>{msg.read_at ? formatDateTime(msg.read_at) : '—'}</td>
                </tr>
              );
            })}
          </AdminTable>
        </>
      )}

      {events.length > 0 && (
        <>
          <div className={s.sectionLabel}>Event log</div>
          <AdminTable head={['When', 'Event', 'Actor', 'Reason']}>
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
          </AdminTable>
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

      {/* Last on the page on purpose: this is for test jobs and junk, and it
          should never sit next to the controls used on real ones. */}
      <div className={s.sectionLabel}>Delete</div>
      <DeleteJobButton submissionId={sub.id} status={sub.status} />
    </div>
  );
}
