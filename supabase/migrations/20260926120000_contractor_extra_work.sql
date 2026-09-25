-- ============================================================================
-- Extra work proposed by the contractor.
--
-- 20260926090000 let an admin key in extra work a customer had asked their
-- contractor for. The other direction happened by phone: the contractor saw
-- something worth doing while on site, rang us, and we typed it in. Clause 5
-- of the contractor terms already says extras go through us so they are
-- recorded and insured — this is the same path with the contractor at the
-- keyboard instead of the admin.
--
-- The job it makes is identical: held for the one contractor, their price on
-- it, the customer accepts and pays a deposit on their job page or ignores
-- it. What differs is who is saying so, which the customer must be told —
-- "priced the work you asked for" is wrong when nobody asked — hence
-- extra_work_origin.
--
-- One shared core (sq_add_extra_work) and two thin wrappers, so the admin
-- and contractor paths cannot drift apart. The core is not callable from
-- outside; the wrappers are service_role only and the app checks who is
-- asking before it calls them.
-- ============================================================================

alter table job_submissions
  add column if not exists extra_work_origin text
    check (extra_work_origin in ('customer', 'contractor'));

-- The ones made so far were all asked for by the customer.
update job_submissions set extra_work_origin = 'customer'
 where extra_work_of is not null and extra_work_origin is null;

create or replace function sq_add_extra_work(
  p_submission_id          uuid,
  p_description            text,
  p_contractor_price_pence int,
  p_price_basis            text,
  p_note_to_client         text,
  p_origin                 text,
  p_actor_type             text,
  p_actor_id               uuid,
  p_reason                 text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_src   job_submissions%rowtype;
  v_new   job_submissions%rowtype;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_res   jsonb;
  v_desc  text := btrim(coalesce(p_description, ''));
  v_name  text;
begin
  select * into v_src from job_submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_src.awarded_contractor_id is null
     or v_src.status not in ('awarded', 'contacted', 'scheduled', 'in_progress',
                             'completed_by_contractor', 'completed', 'paid') then
    return jsonb_build_object('ok', false, 'reason', 'not_booked', 'status', v_src.status);
  end if;
  if char_length(v_desc) not between 3 and 200 then
    return jsonb_build_object('ok', false, 'reason', 'bad_description');
  end if;
  if coalesce(p_contractor_price_pence, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_price');
  end if;
  if p_price_basis not in ('unspecified', 'inc_vat', 'no_vat') then
    return jsonb_build_object('ok', false, 'reason', 'bad_basis');
  end if;
  if p_origin not in ('customer', 'contractor') then
    return jsonb_build_object('ok', false, 'reason', 'bad_origin');
  end if;

  select business_name into v_name from contractors where id = v_src.awarded_contractor_id;

  insert into job_submissions (
    status, confirmed_at, distributed_at, expires_at,
    raw_text, service_verbatim, service_confirmed,
    area_value, area_unit, area_source, area_mapped_value, boundary,
    postcode, lat, lng, county_id, gate_w3w, gate_width, access_notes, obstacles,
    contact_name, contact_phone, contact_email, contact_preference, customer_id,
    client_token, extra_work_of, extra_work_origin,
    preferred_contractor_id, market_opens_at, first_refusal)
  values (
    'distributed', now(), now(), now() + interval '14 days',
    format('Extra work on job %s: %s. %s', left(v_src.id::text, 8), v_desc,
           coalesce(nullif(btrim(p_reason), ''),
                    case p_origin when 'contractor' then 'Proposed by the contractor.'
                                  else 'Asked for by the customer.' end)),
    v_desc, false,
    v_src.area_value, v_src.area_unit, v_src.area_source, v_src.area_mapped_value, v_src.boundary,
    v_src.postcode, v_src.lat, v_src.lng, v_src.county_id, v_src.gate_w3w, v_src.gate_width,
    v_src.access_notes, v_src.obstacles,
    v_src.contact_name, v_src.contact_phone, v_src.contact_email, v_src.contact_preference,
    v_src.customer_id,
    encode(extensions.gen_random_bytes(24), 'hex'), v_src.id, p_origin,
    v_src.awarded_contractor_id, now() + interval '48 hours', false)
  returning * into v_new;

  insert into job_invitations (submission_id, contractor_id, token, status)
  values (v_new.id, v_src.awarded_contractor_id, v_token, 'viewed');

  -- The same write path as a price typed on the pricing page, so the client
  -- price, the label, the status move and the customer's email all come from
  -- where they always do.
  v_res := submit_contractor_quote(v_token, 'total', p_contractor_price_pence, null, null,
    false,
    case p_actor_type when 'operator' then 'Entered by admin: ' || btrim(coalesce(p_reason, ''))
                      else 'Proposed by the contractor from their won-jobs page' end,
    (current_date + 14), 'form', true,
    p_price_basis, nullif(btrim(coalesce(p_note_to_client, '')), ''));
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'submit_contractor_quote refused: %', v_res;   -- undo the lot
  end if;

  -- Priced by the one contractor the customer already knows by name: don't
  -- promise more prices, and say who it is and whose idea it was.
  update pending_emails
     set payload = payload || jsonb_build_object(
           'sole_offer', true,
           'contractor_name', v_name,
           'extra_work_origin', p_origin,
           'extra_work_description', v_desc)
   where kind = 'sq_first_quote' and status = 'pending'
     and payload->>'client_token' = v_new.client_token;

  perform log_job_event(v_new.id,
    case p_origin when 'contractor' then 'created_by_contractor' else 'created_by_admin' end,
    null, null, p_actor_type, p_actor_id, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('extra_work_of', v_src.id, 'origin', p_origin,
                       'contractor_price_pence', p_contractor_price_pence));
  perform log_job_event(v_src.id,
    case p_origin when 'contractor' then 'extra_work_proposed' else 'extra_work_offered' end,
    null, null, p_actor_type, p_actor_id, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('extra_job_id', v_new.id, 'description', v_desc, 'origin', p_origin,
                       'contractor_price_pence', p_contractor_price_pence));

  return jsonb_build_object('ok', true, 'id', v_new.id,
    'client_price_pence', (select client_price_pence from client_quotes
                            where submission_id = v_new.id order by created_at desc limit 1));
end;
$$;

revoke execute on function sq_add_extra_work(uuid, text, int, text, text, text, text, uuid, text)
  from public, anon, authenticated;

-- Admin wrapper: same signature and behaviour as before.
create or replace function admin_add_extra_work(
  p_submission_id          uuid,
  p_description            text,
  p_contractor_price_pence int,
  p_price_basis            text,
  p_actor_id               uuid,
  p_reason                 text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if btrim(coalesce(p_reason, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_reason');
  end if;
  return sq_add_extra_work(p_submission_id, p_description, p_contractor_price_pence,
    p_price_basis, null, 'customer', 'operator', p_actor_id, p_reason);
end;
$$;

revoke execute on function admin_add_extra_work(uuid, text, int, text, uuid, text)
  from public, anon, authenticated;
grant execute on function admin_add_extra_work(uuid, text, int, text, uuid, text) to service_role;

-- Contractor wrapper. The app supplies p_contractor_id from the session; the
-- function only trusts it as far as checking the job really is theirs.
--
-- One open proposal per job at a time: the customer has not answered the
-- last one, so a second is either a duplicate or a re-price, and both belong
-- with us rather than as a stack of unanswered prices in their inbox.
create or replace function contractor_add_extra_work(
  p_submission_id          uuid,
  p_contractor_id          uuid,
  p_description            text,
  p_contractor_price_pence int,
  p_price_basis            text,
  p_note_to_client         text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select awarded_contractor_id into v_owner from job_submissions where id = p_submission_id;
  if v_owner is null or v_owner is distinct from p_contractor_id then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  if exists (select 1 from job_submissions x
              where x.extra_work_of = p_submission_id
                and x.status in ('confirmed', 'distributed', 'quotes_receiving',
                                 'accepted_awaiting_payment')) then
    return jsonb_build_object('ok', false, 'reason', 'one_open_already');
  end if;
  return sq_add_extra_work(p_submission_id, p_description, p_contractor_price_pence,
    p_price_basis, p_note_to_client, 'contractor', 'contractor', p_contractor_id, null);
end;
$$;

revoke execute on function contractor_add_extra_work(uuid, uuid, text, int, text, text)
  from public, anon, authenticated;
grant execute on function contractor_add_extra_work(uuid, uuid, text, int, text, text) to service_role;
