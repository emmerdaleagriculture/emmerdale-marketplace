-- ════════════════════════════════════════════════════════════════════════
-- Contractors can price by the unit: per bale, per day, per load.
--
-- The form offered two shapes: a total, and £/acre with a minimum. Both are
-- paddock shapes. Hay is priced per bale and tractor hire per day, so a
-- contractor asked for "20 small bales and then monthly ongoing" had to
-- decide for themselves whether the one box meant the first delivery or the
-- arrangement — and the honest way to settle that is to ring the customer,
-- which the sealed flow exists to prevent.
--
-- WHY THE QUANTITY IS REQUIRED. The customer has to end up with one figure
-- they can accept and pay a deposit against, so a unit price alone is not a
-- quote. The contractor states the rate AND how many they are quoting for,
-- exactly as a rate quote multiplies £/acre by an acreage — except the
-- quantity comes from the contractor rather than from a drawn boundary,
-- because nobody has measured twenty bales.
--
-- rate_value_pence carries the per-unit price rather than a new column: it is
-- already "the rate", already marked up onto client_rate_value_pence by
-- sq_publish_quote, and already rendered beside the total. Only the label and
-- the quantity are new.
-- ════════════════════════════════════════════════════════════════════════

alter table contractor_quotes add column if not exists unit_label text;
alter table contractor_quotes add column if not exists unit_quantity numeric;
alter table client_quotes     add column if not exists unit_label text;
alter table client_quotes     add column if not exists unit_quantity numeric;

comment on column contractor_quotes.unit_label is
  'What one unit is — bale, day, load. Set only for quote_type = ''unit''; '
  'rate_value_pence holds the price of one.';

-- 'unit' joins the shapes a quote can take.
alter table contractor_quotes drop constraint if exists contractor_quotes_quote_type_check;
alter table contractor_quotes add constraint contractor_quotes_quote_type_check
  check (quote_type in ('total', 'rate', 'unit'));

-- A unit quote without both halves is not a price.
alter table contractor_quotes drop constraint if exists cq_unit_needs_both;
alter table contractor_quotes add constraint cq_unit_needs_both
  check (quote_type <> 'unit'
         or (rate_value_pence is not null and unit_quantity > 0 and btrim(coalesce(unit_label,'')) <> ''));


-- ── submit_contractor_quote: accept a unit quote ────────────────────────
-- Signature gains p_unit_label and p_unit_quantity, both defaulted, so the
-- email-parse caller and anything else already written keeps working.
drop function if exists public.submit_contractor_quote(
  text, text, integer, integer, integer, boolean, text, date, text, boolean, text, text);

CREATE OR REPLACE FUNCTION public.submit_contractor_quote(p_token text, p_quote_type text, p_price_pence integer, p_rate_value_pence integer, p_rate_minimum_pence integer, p_site_visit boolean, p_notes text, p_valid_until date, p_source text, p_confirmed boolean, p_price_basis text DEFAULT 'unspecified', p_note_to_client text DEFAULT NULL, p_unit_label text DEFAULT NULL, p_unit_quantity numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv job_invitations%rowtype;
  v_js job_submissions%rowtype;
  v_prior contractor_quotes%rowtype;
  v_prior_cq_status text;
  v_acres numeric;
  v_price int;
  v_new_id uuid;
  v_confirm_token text;
  v_note text;
  v_unit text;
begin
  select * into v_inv from job_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_js from job_submissions where id = v_inv.submission_id for update;

  if v_js.status not in ('distributed','quotes_receiving','accepted_awaiting_payment') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if v_inv.status in ('declined','closed_awarded','closed_stale') then
    return jsonb_build_object('ok', false, 'reason', 'declined');
  end if;
  if p_quote_type not in ('total','rate','unit') then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;
  if coalesce(p_price_basis, 'unspecified') not in ('unspecified','inc_vat','no_vat') then
    return jsonb_build_object('ok', false, 'reason', 'bad_basis');
  end if;

  v_note := nullif(left(trim(coalesce(p_note_to_client, '')), 200), '');
  v_unit := nullif(left(trim(coalesce(p_unit_label, '')), 24), '');

  if p_quote_type = 'rate' then
    if p_rate_value_pence is null or p_rate_value_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_rate');
    end if;
    v_acres := coalesce(v_js.area_mapped_value,
                        case when v_js.area_unit = 'acres' then v_js.area_value end);
    if v_acres is null or v_acres <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'rate_needs_area');
    end if;
    v_price := greatest(round(p_rate_value_pence * v_acres)::int,
                        coalesce(p_rate_minimum_pence, 0));
  elsif p_quote_type = 'unit' then
    -- Both halves, or it is not a price the customer can accept.
    if p_rate_value_pence is null or p_rate_value_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_rate');
    end if;
    if p_unit_quantity is null or p_unit_quantity <= 0 or v_unit is null then
      return jsonb_build_object('ok', false, 'reason', 'unit_needs_quantity');
    end if;
    v_price := greatest(round(p_rate_value_pence * p_unit_quantity)::int,
                        coalesce(p_rate_minimum_pence, 0));
  else
    if p_price_pence is null or p_price_pence <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'bad_price');
    end if;
    v_price := p_price_pence;
  end if;

  if p_valid_until is not null and v_js.expires_at is not null
     and p_valid_until > v_js.expires_at::date then
    p_valid_until := v_js.expires_at::date;
  end if;

  select * into v_prior from contractor_quotes
   where submission_id = v_js.id and contractor_id = v_inv.contractor_id
     and superseded_by is null and confirmed_by_contractor
   order by created_at desc limit 1;

  if v_prior.id is not null then
    select status into v_prior_cq_status
      from client_quotes where contractor_quote_id = v_prior.id;
    if v_prior_cq_status = 'accepted' then
      return jsonb_build_object('ok', false, 'reason', 'accepted_pending_payment');
    end if;
  end if;

  if p_confirmed = false then v_confirm_token := sq_token(); end if;

  if coalesce(p_confirmed, true) and v_prior.id is not null then
    update contractor_quotes set superseded_by = v_prior.id where id = v_prior.id;
  end if;

  insert into contractor_quotes (
    submission_id, contractor_id, invitation_id, quote_type,
    contractor_price_pence, rate_value_pence, rate_minimum_pence,
    notes_internal, site_visit_required, valid_until,
    source, confirmed_by_contractor, confirm_token, price_basis,
    note_to_client, unit_label, unit_quantity
  ) values (
    v_js.id, v_inv.contractor_id, v_inv.id, p_quote_type,
    v_price, p_rate_value_pence, p_rate_minimum_pence,
    nullif(trim(coalesce(p_notes,'')), ''), coalesce(p_site_visit, false),
    coalesce(p_valid_until, coalesce(v_js.expires_at::date, current_date + 7)),
    p_source, coalesce(p_confirmed, true), v_confirm_token,
    coalesce(p_price_basis, 'unspecified'),
    v_note,
    case when p_quote_type = 'unit' then v_unit end,
    case when p_quote_type = 'unit' then p_unit_quantity end
  ) returning id into v_new_id;

  if coalesce(p_confirmed, true) and v_prior.id is not null then
    update contractor_quotes set superseded_by = v_new_id where id = v_prior.id;
    update client_quotes set status = 'superseded'
     where contractor_quote_id = v_prior.id and status = 'active';
    insert into invitation_events (invitation_id, contractor_id, event_type)
    values (v_inv.id, v_inv.contractor_id, 'revised');
  else
    insert into invitation_events (invitation_id, contractor_id, event_type, metadata)
    values (v_inv.id, v_inv.contractor_id,
            case when coalesce(p_confirmed, true) then 'priced' else 'confirm_pending' end,
            jsonb_build_object('time_to_price_seconds',
              extract(epoch from now() - v_inv.sent_at)::int));
  end if;

  if coalesce(p_confirmed, true) then
    perform sq_publish_quote(v_new_id);
    return jsonb_build_object('ok', true, 'quote_id', v_new_id);
  end if;

  insert into pending_emails (kind, to_email, payload)
  select 'sq_quote_confirm', ct.email, jsonb_build_object(
    'confirm_token', v_confirm_token,
    'amount_pence', v_price,
    'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
    'postcode_district', split_part(v_js.postcode, ' ', 1))
  from contractors ct where ct.id = v_inv.contractor_id;
  return jsonb_build_object('ok', true, 'quote_id', v_new_id, 'pending_confirm', true);
end;
$function$;

revoke execute on function
  submit_contractor_quote(text,text,int,int,int,boolean,text,date,text,boolean,text,text,text,numeric)
  from public, anon, authenticated;
grant execute on function
  submit_contractor_quote(text,text,int,int,int,boolean,text,date,text,boolean,text,text,text,numeric)
  to service_role;


-- ── sq_publish_quote: carry the unit onto the client row ────────────────
-- Live definition with the two columns added; nothing else changed.
CREATE OR REPLACE FUNCTION public.sq_publish_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cq contractor_quotes%rowtype;
  v_js job_submissions%rowtype;
  v_rate numeric;
  v_label text;
  v_n int;
  v_ct contractors%rowtype;
begin
  select * into v_cq from contractor_quotes where id = p_quote_id;
  select * into v_js from job_submissions where id = v_cq.submission_id;
  select * into v_ct from contractors where id = v_cq.contractor_id;
  v_rate := app_config_num('sq_markup_rate', 0.10);

  -- Stable label: reuse this contractor's existing label on this submission,
  -- else allocate the next in arrival order.
  select contractor_display_label into v_label
    from client_quotes
   where submission_id = v_cq.submission_id and contractor_id = v_cq.contractor_id
   limit 1;
  if v_label is null then
    select count(distinct contractor_id) + 1 into v_n
      from client_quotes where submission_id = v_cq.submission_id;
    v_label := 'Contractor ' || case when v_n <= 26 then chr(64 + v_n) else v_n::text end;
  end if;

  insert into client_quotes (
    submission_id, contractor_quote_id, contractor_id,
    client_price_pence, markup_rate,
    client_rate_value_pence, client_rate_minimum_pence,
    contractor_display_label, contractor_rating_avg, contractor_rating_count,
    distance_miles, site_visit_required, valid_until, price_basis,
    contractor_note, unit_label, unit_quantity
  )
  select
    v_cq.submission_id, v_cq.id, v_cq.contractor_id,
    client_price_pence(v_cq.contractor_price_pence, v_rate), v_rate,
    -- Rate quotes: the rate itself is marked up to the penny (ceil); the
    -- headline indicative total above gets the full ceil-to-£5 treatment.
    case when v_cq.rate_value_pence is not null
         then ceil(v_cq.rate_value_pence * (1 + v_rate))::int end,
    case when v_cq.rate_minimum_pence is not null
         then ceil(v_cq.rate_minimum_pence * (1 + v_rate))::int end,
    v_label, v_ct.rating_avg, v_ct.rating_count,
    i.distance_miles, v_cq.site_visit_required, v_cq.valid_until, v_cq.price_basis,
    v_cq.note_to_client,
    -- Carried so the customer sees "£12 per bale × 20", not a bare total with
    -- no way to tell how it was arrived at.
    v_cq.unit_label, v_cq.unit_quantity
  from job_invitations i where i.id = v_cq.invitation_id;

  update job_invitations set status = 'priced' where id = v_cq.invitation_id;

  perform log_job_event(v_cq.submission_id, 'quote_received', null, null, 'contractor',
    v_cq.contractor_id, null,
    jsonb_build_object('quote_id', v_cq.id,
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate)));

  -- First price → quotes_receiving + immediate client email (§16a.1).
  -- The note deliberately does NOT go in this email: email cannot be
  -- retracted and toHtml() linkifies anything that looks like a URL.
  if v_js.status = 'distributed' then
    update job_submissions set status = 'quotes_receiving', quotes_notified_at = now()
     where id = v_js.id;
    perform log_job_event(v_js.id, 'status_change', 'distributed', 'quotes_receiving',
      'system', null, null, '{}');
    insert into pending_emails (kind, to_email, payload)
    values ('sq_first_quote', v_js.contact_email, jsonb_build_object(
      'client_token', v_js.client_token,
      'service', sq_service_label(v_js.service_id, v_js.service_verbatim),
      'client_price_pence', client_price_pence(v_cq.contractor_price_pence, v_rate),
      'contractor_label', v_label,
      'price_basis', v_cq.price_basis,
      'contact_name', v_js.contact_name,
      'sole_offer', v_js.first_refusal and v_js.market_opens_at is not null
                    and v_js.preferred_contractor_id = v_cq.contractor_id));
  end if;
end;
$function$;
