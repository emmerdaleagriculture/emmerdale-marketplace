import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ConfirmStep } from '../../ConfirmStep';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { ParseResult } from '@/lib/jobParse/schema';
import type { AreaUnit, CanonicalService, Urgency } from '@/lib/jobParse/schema';
import a from '../../../auth.module.css';

export const metadata: Metadata = { title: 'Order it again', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Order it again: a new draft copied from a job the customer already had done,
 * dropped straight into the confirm step.
 *
 * Reviewed rather than sent blind. A repeat is priced by contractors from the
 * pack it carries, and a year-old access note or a target date in the past is
 * worse than no note at all — so the customer sees it before it goes, and the
 * ordinary confirm action takes it from there. Nothing about the downstream
 * path is special-cased: a repeat is just a job.
 */
export default async function OrderAgainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/start/again/${id}`)}`);

  const admin = createServiceRoleClient();
  const { data: src } = await admin
    .from('job_submissions')
    .select('*, service:services(name)')
    .eq('id', id)
    .eq('customer_id', user.id)
    .maybeSingle();
  if (!src) notFound();

  // A fresh draft, not an edit of the old one: the previous job keeps its own
  // history, and the confirm action only ever updates a draft it minted.
  const { data: draft, error } = await admin
    .from('job_submissions')
    .insert({
      customer_id: user.id,
      raw_text: src.raw_text,
      location_raw: src.location_raw,
      service_id: src.service_id,
      service_verbatim: src.service_verbatim,
      area_value: src.area_value,
      area_unit: src.area_unit,
      area_source: src.area_source,
      area_mapped_value: src.area_mapped_value,
      boundary: src.boundary,
      postcode: src.postcode,
      lat: src.lat,
      lng: src.lng,
      county_id: src.county_id,
      access_notes: src.access_notes,
      obstacles: src.obstacles,
      service_attributes: src.service_attributes,
      gate_w3w: src.gate_w3w,
      gate_width: src.gate_width,
      photo_paths: src.photo_paths,
    })
    .select('id')
    .single();
  if (error || !draft) {
    console.error('[reorder] draft insert failed:', error);
    notFound();
  }

  const countyName = src.county_id
    ? ((await admin.from('counties').select('name').eq('id', src.county_id).maybeSingle()).data
        ?.name ?? null)
    : null;

  const result: ParseResult = {
    submission_id: draft.id,
    parse_source: 'deterministic_fallback',
    // The stored service_id came from the canonical list, so its name is a
    // CanonicalService — but the join types it as plain text.
    service: ((src.service as { name: string } | null)?.name ?? null) as CanonicalService | null,
    service_verbatim: src.service_verbatim ?? src.raw_text ?? '',
    service_alternatives: [],
    area_value: src.area_value,
    area_unit: (src.area_unit as AreaUnit | null) ?? null,
    postcode: src.postcode,
    county_name: countyName,
    // The county came with the job, so there is nothing to ask.
    county_candidates: [],
    county_choice_reason: null,
    lat: src.lat,
    lng: src.lng,
    urgency: (src.urgency as Urgency | null) ?? null,
    // Deliberately blank: last time's date is in the past, and carrying it
    // forward would send contractors a job that reads as already overdue.
    target_date: null,
    access_notes: src.access_notes ?? '',
    obstacles: src.obstacles ?? '',
    service_attributes: (src.service_attributes as Record<string, string>) ?? {},
    parse_confidence: {},
    missing_fields: [],
  };

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Order it again</div>
          <h1 className={a.title}>Same job, fresh prices.</h1>
          <p className={a.sub}>
            Everything below is copied from last time — the field, the access notes and
            the photos. Change anything that&rsquo;s moved on, then send it and
            contractors will price it again.
          </p>
          <ConfirmStep result={result} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
