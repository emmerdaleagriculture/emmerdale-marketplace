-- ============================================================================
-- The iPhone app line on texts (app live on the App Store 2026-11-06).
--
-- send-emails/sms.ts adds " iPhone app: <site>/iphone" to a text when it
-- costs nothing (no extra segment), or at most once every 30 days per phone
-- when it does. This records which texts carried it, so the 30 days can be
-- counted. Contractors signed in on the app (a live device_tokens row) never
-- get it.
-- ============================================================================

alter table public.pending_sms
  add column if not exists app_line boolean not null default false;

create index if not exists pending_sms_app_line_phone_idx
  on public.pending_sms (to_phone, sent_at) where app_line;

comment on column public.pending_sms.app_line is
  'The text carried the iPhone app line (send-emails/sms.ts withSmsAppLine).';
