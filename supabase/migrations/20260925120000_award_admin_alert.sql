-- ============================================================================
-- Tell the admins when a job is won.
--
-- An award is the moment money moves — the customer has accepted a price and
-- paid the deposit — and until now nobody on our side heard about it unless
-- they happened to open /admin. award_submission (20260920120000) is the only
-- path to 'awarded', but this hangs off the status change rather than being
-- one more line in that function: it is a hundred lines that every pricing
-- change redefines, and a notify buried in it is one careless copy from gone.
--
-- sq_notify_once keys on (submission, '__admin__', kind), so a job that is
-- somehow awarded twice still sends one email.
-- ============================================================================

create or replace function sq_award_admin_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
      'submission_id',          new.id,
      'service',                sq_service_label(new.service_id, new.service_verbatim),
      'county',                 c.name,
      'postcode',               new.postcode,
      'contact_name',           new.contact_name,
      'contractor',             ct.business_name,
      'client_price_pence',     clq.client_price_pence,
      'contractor_price_pence', cq.contractor_price_pence,
      'price_basis',            clq.price_basis,
      'deposit_pence',          (select jp.amount_pence from job_payments jp
                                  where jp.submission_id = new.id
                                    and jp.kind = 'deposit' and jp.status = 'paid'
                                  order by jp.paid_at desc limit 1))
    into v_payload
    from (select 1) one
    left join counties c           on c.id   = new.county_id
    left join contractors ct       on ct.id  = new.awarded_contractor_id
    left join client_quotes clq    on clq.id = new.accepted_client_quote_id
    left join contractor_quotes cq on cq.id  = clq.contractor_quote_id;

  perform sq_notify_once(new.id, '__admin__', 'sq_award_admin', '__admin__', v_payload);
  return new;
end;
$$;

revoke execute on function sq_award_admin_alert() from public, anon, authenticated;

drop trigger if exists job_submissions_award_admin_alert on job_submissions;
create trigger job_submissions_award_admin_alert
  after update of status on job_submissions
  for each row
  when (new.status = 'awarded' and old.status is distinct from 'awarded')
  execute function sq_award_admin_alert();
