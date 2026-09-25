-- ============================================================================
-- Extra work on a booked job, as a job of its own.
--
-- A customer asks their contractor for more (lime and fertiliser on top of a
-- paddock renovation); the contractor prices it to us, and the customer has
-- to accept that price and pay a deposit on it. Folding it into the booked
-- job would mean teaching the balance, the payout, the invoice and the
-- cancellation schedule about a second price. As its own job, offered to the
-- same contractor with their price already on it, every one of those works
-- unchanged — which is how the first one (25 Sept 2026) was done by hand.
--
-- extra_work_of links it to the job it extends. Not repeat_of: a repeat is
-- the same work again and has its own paths (/start/again, schedules).
--
-- The job is held for its contractor (preferred_contractor_id +
-- market_opens_at) without first_refusal, so neither branch of
-- sq_direct_window_tick opens it: they have priced, and branch B is first-
-- refusal only. Late invites skip held jobs. It reaches the market only if
-- the customer asks for other prices themselves.
-- ============================================================================

alter table job_submissions
  add column if not exists extra_work_of uuid references job_submissions(id);
create index if not exists job_submissions_extra_work_of_idx
  on job_submissions (extra_work_of) where extra_work_of is not null;

-- The one made by hand, linked as a repeat because nothing else existed.
update job_submissions
   set extra_work_of = repeat_of, repeat_of = null
 where id = '4772b185-14b3-4840-9c82-edfc23121be6'
   and repeat_of = 'd0087ec3-3a7c-4f6b-9d2f-704ff2303d4b';

create or replace function admin_add_extra_work(
  p_submission_id          uuid,
  p_description            text,
  p_contractor_price_pence int,
  p_price_basis            text,
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
  if btrim(coalesce(p_reason, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_reason');
  end if;

  insert into job_submissions (
    status, confirmed_at, distributed_at, expires_at,
    raw_text, service_verbatim, service_confirmed,
    area_value, area_unit, area_source, area_mapped_value, boundary,
    postcode, lat, lng, county_id, gate_w3w, gate_width, access_notes, obstacles,
    contact_name, contact_phone, contact_email, contact_preference, customer_id,
    client_token, extra_work_of, preferred_contractor_id, market_opens_at, first_refusal)
  values (
    'distributed', now(), now(), now() + interval '14 days',
    format('Extra work on job %s: %s. %s', left(v_src.id::text, 8), v_desc, btrim(p_reason)),
    v_desc, false,
    v_src.area_value, v_src.area_unit, v_src.area_source, v_src.area_mapped_value, v_src.boundary,
    v_src.postcode, v_src.lat, v_src.lng, v_src.county_id, v_src.gate_w3w, v_src.gate_width,
    v_src.access_notes, v_src.obstacles,
    v_src.contact_name, v_src.contact_phone, v_src.contact_email, v_src.contact_preference,
    v_src.customer_id,
    encode(extensions.gen_random_bytes(24), 'hex'), v_src.id, v_src.awarded_contractor_id,
    now() + interval '48 hours', false)
  returning * into v_new;

  insert into job_invitations (submission_id, contractor_id, token, status)
  values (v_new.id, v_src.awarded_contractor_id, v_token, 'viewed');

  -- The same write path as a price typed on the pricing page, so the client
  -- price, the label, the status move and the customer's email all come from
  -- where they always do.
  v_res := submit_contractor_quote(v_token, 'total', p_contractor_price_pence, null, null,
    false, 'Entered by admin: ' || btrim(p_reason), (current_date + 14), 'form', true,
    p_price_basis, null);
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'submit_contractor_quote refused: %', v_res;   -- undo the lot
  end if;

  -- Priced by the one contractor the customer asked: don't promise more.
  update pending_emails set payload = payload || '{"sole_offer": true}'::jsonb
   where kind = 'sq_first_quote' and status = 'pending'
     and payload->>'client_token' = v_new.client_token;

  perform log_job_event(v_new.id, 'created_by_admin', null, null, 'operator', p_actor_id,
    btrim(p_reason), jsonb_build_object('extra_work_of', v_src.id,
                                        'contractor_price_pence', p_contractor_price_pence));
  perform log_job_event(v_src.id, 'extra_work_offered', null, null, 'operator', p_actor_id,
    btrim(p_reason), jsonb_build_object('extra_job_id', v_new.id, 'description', v_desc,
                                        'contractor_price_pence', p_contractor_price_pence));

  return jsonb_build_object('ok', true, 'id', v_new.id,
    'client_price_pence', (select client_price_pence from client_quotes
                            where submission_id = v_new.id order by created_at desc limit 1));
end;
$$;

revoke execute on function admin_add_extra_work(uuid, text, int, text, uuid, text)
  from public, anon, authenticated;
grant execute on function admin_add_extra_work(uuid, text, int, text, uuid, text) to service_role;
