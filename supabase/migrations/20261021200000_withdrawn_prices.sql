-- A price an admin took down (an hourly rate posing as a job price, 21 Oct
-- 2026: CGS Ltd on GU22). 'closed' alone can't say so: it is also every
-- losing price once a job is awarded or ends, and those still belong in the
-- price range the admin list shows. withdrawn_at marks the ones that never
-- stood; the admin "Withdraw" button sets it with status 'closed', so the
-- customer's page (active/accepted only) drops it the same way.
alter table public.client_quotes add column if not exists withdrawn_at timestamptz;

comment on column public.client_quotes.withdrawn_at is
  'Set when an admin withdrew this price (status closed at the same time). Left out of admin price ranges.';

-- The one withdrawn by hand before this column existed.
update public.client_quotes
   set withdrawn_at = '2026-10-21 18:50:00+00'
 where id = '9310536c-5c25-4151-ae2f-170d43a24dd9'
   and status = 'closed'
   and withdrawn_at is null;
