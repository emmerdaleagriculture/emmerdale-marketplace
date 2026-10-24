-- ============================================================================
-- The balance is due on receipt.
--
-- Since 20260910120000 the balance request has given the customer
-- sq_balance_terms_days (7) to pay, and every email, the job page, the Stripe
-- line and the customer terms said so. The user's decision on 2026-10-24: no
-- time to pay. The balance falls due the moment the work is confirmed done
-- and the request goes out.
--
-- Mechanically that is sq_balance_terms_days = 0: sq_open_balance already
-- computes due_at as now() + the terms, and the copy (send-emails,
-- my/[token], the legal pages) reads the terms and says "on receipt" when
-- they are zero. Jobs whose balance was requested under the 7-day terms keep
-- their due_at; the customer terms say the version accepted applies.
--
-- One knock-on. sq_alert_overdue_balances told the admins about any balance
-- past due_at, which with due_at = now() is every balance on the next morning
-- run. "Overdue" now means sq_balance_chase_days (3) past due: long enough
-- for a bank transfer to land, short enough to chase while the job is fresh.
-- ============================================================================

update app_config set value = '0' where key = 'sq_balance_terms_days';
insert into app_config (key, value) values ('sq_balance_chase_days', '3')
on conflict (key) do nothing;

CREATE OR REPLACE FUNCTION public.sq_alert_overdue_balances()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_n int := 0;
begin
  for r in
    select p.id, p.submission_id, p.amount_pence, p.due_at
      from job_payments p
     where p.kind = 'balance' and p.status in ('due', 'requested', 'failed')
       and p.due_at < now() - make_interval(days => app_config_num('sq_balance_chase_days', 3)::int)
  loop
    if sq_notify_once(r.submission_id, '__admin__', 'sq_balance_overdue', '__admin__',
         jsonb_build_object('submission_id', r.submission_id,
                            'amount_pence', r.amount_pence, 'due_at', r.due_at)) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$function$;
