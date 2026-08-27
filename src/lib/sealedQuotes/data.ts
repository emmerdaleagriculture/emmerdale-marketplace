import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from './tokens';
import type { JobSpecPhoto } from '@/components/job/JobSpecCard';

/**
 * Server-side data access for the token-addressed pages. The token IS the
 * authorisation: format-check first (rejects junk before it costs a query),
 * then an indexed equality lookup of the unguessable 192-bit value. All
 * queries are service-role — these pages have no session.
 */

export async function getInvitationByToken(token: string) {
  if (!isTokenFormat(token)) return null;
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('job_invitations')
    .select(
      `id, token, status, decline_reason, distance_miles, sent_at, opened_at, contractor_id,
       submission:job_submissions (
         id, status, expires_at, awarded_contractor_id, postcode, lat, lng, boundary,
         area_value, area_unit, area_mapped_value, area_source,
         urgency, target_date, access_notes, obstacles, gate_width,
         service_attributes, photo_paths,
         service:services (id, name, area_priced),
         county:counties (name)
       )`,
    )
    .eq('token', token)
    .maybeSingle();
  return data ?? null;
}

/** Latest live quote for this invitation's contractor on this job. */
export async function getLiveQuote(submissionId: string, contractorId: string) {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('contractor_quotes')
    .select('id, quote_type, contractor_price_pence, rate_value_pence, rate_minimum_pence, site_visit_required, valid_until, confirmed_by_contractor, created_at')
    .eq('submission_id', submissionId)
    .eq('contractor_id', contractorId)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function getSubmissionByClientToken(token: string) {
  if (!isTokenFormat(token)) return null;
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('job_submissions')
    .select(
      `id, status, expires_at, awarded_at, accepted_client_quote_id, contact_name,
       postcode, lat, lng, boundary, area_value, area_unit, area_mapped_value,
       urgency, target_date, access_notes, obstacles, gate_width, gate_w3w,
       service_attributes, photo_paths, service_verbatim,
       service:services (id, name),
       county:counties (name)`,
    )
    .eq('client_token', token)
    .is('client_token_revoked_at', null)
    .maybeSingle();
  return data ?? null;
}

/**
 * The prices a client may see — columns picked explicitly; contractor_id and
 * contractor_quote_id never leave the server (§22 criterion 1 by construction).
 */
export async function getClientQuotes(submissionId: string) {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('client_quotes')
    .select(
      'id, client_price_pence, client_rate_value_pence, client_rate_minimum_pence, contractor_display_label, contractor_real_name, contractor_rating_avg, contractor_rating_count, distance_miles, site_visit_required, valid_until, status',
    )
    .eq('submission_id', submissionId)
    .in('status', ['active', 'accepted'])
    .gte('valid_until', new Date().toISOString().slice(0, 10));
  return data ?? [];
}

const PHOTO_LABELS: Record<string, string> = {
  field: 'The field',
  access: 'Gateway / access',
};

export async function signPhotos(paths: string[] | null): Promise<JobSpecPhoto[]> {
  if (!paths?.length) return [];
  const admin = createServiceRoleClient();
  const out: JobSpecPhoto[] = [];
  for (const path of paths) {
    const { data } = await admin.storage.from('job-photos').createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      const stem = path.split('/').pop()?.split('.')[0] ?? 'photo';
      out.push({ url: data.signedUrl, label: PHOTO_LABELS[stem] ?? 'Photo' });
    }
  }
  return out;
}

export async function getCompositeWeight(): Promise<number> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('app_config').select('value').eq('key', 'sq_composite_weight').maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) ? n : 0.3;
}
