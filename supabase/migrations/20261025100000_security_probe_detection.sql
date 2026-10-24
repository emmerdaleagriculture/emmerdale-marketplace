-- ============================================================================
-- Security: probe detection, schema audit, watchdog and alerts.
--
-- Nothing here would have alarmed on the kind of scan this is built for:
-- ~350 requests from ~70 IPs in one hosting range, 5 to 9 requests each, so
-- every per-IP threshold sleeps. The scan hits <ref>.supabase.co directly,
-- which is Supabase's edge and not ours, so nothing we run in front of the
-- website sees it either. The only place it is visible is the API-gateway
-- log, which Postgres cannot read.
--
-- Four layers, cheapest first:
--   Layer 0  audit_anon_writable_rpcs(), weekly. Reads the catalog for what a
--            scanner would exploit: anon- or authenticated-callable writer RPCs
--            with no caller check, public buckets that accept active content,
--            write policies that are `true` or merely "signed in". Anything not
--            on the reviewed allowlist raises a card.
--   Layer 1  the detect-probe-activity edge function, every 15 min. Reads the
--            gateway log through the Analytics API, scores and clusters
--            actors, writes security_probe_events and a security_anomalies
--            card per cluster. Posted to by probe_detector_tick().
--   Watchdog detect_probe_detector_gap(), hourly. The detector writes a
--            heartbeat into app_config.probe_detector_state on every live
--            firing; an hour without a success is a critical card, because
--            "no scan found anything" and "the scanner stopped" look the same.
--   Alerts   security_critical_email_tick(), hourly, mails new criticals
--            through the existing pending_emails queue (admin_direct), at most
--            one per rule per 24 h; security_daily_digest_tick() at 07:00 lists
--            the day when there is anything to list.
--
-- Not ported from the source system: Layer 2 (Cloudflare IP Access Rules on
-- the website zone). This site is on Vercel with no Cloudflare zone in front
-- of it, so there is nothing for it to act on; the response columns are kept
-- on security_probe_events so it can be added without a schema change.
--
-- Secrets the detector needs, set by hand (never in a migration):
--   select vault.create_secret('<personal access token>', 'supabase_mgmt_token');
--   supabase secrets set MGMT_API_TOKEN=<the same token>
-- The Analytics API rejects project keys; it wants a PERSONAL access token
-- (Dashboard > Account > Access Tokens). CRON_SECRET and project_url already
-- exist for the email drain and are reused as the function's gate and URL.
-- ============================================================================

-- ── Anomalies: the health pipe every rule writes to ──────────────────────────
--
-- One row per open finding. A detector raises; the hourly email, the digest
-- and the admin Security tab read; an admin or the detector's own recovery
-- condition resolves. There is no FK to a streams table: the source system's
-- biggest trap was a detector that returned silently while healthy and threw
-- on its first raise because its stream row was missing.
create table if not exists security_anomalies (
  id            bigint generated always as identity primary key,
  -- 'security_probe' (the detector and its watchdog) or 'security_audit'.
  stream        text not null,
  -- probe_scan | probe_detector_blind | probe_detector_unscored |
  -- anon_writable_rpc | bucket_active_content | permissive_write_policy |
  -- audit_failed
  rule          text not null,
  severity      text not null check (severity in ('info', 'warning', 'critical')),
  message       text not null,
  -- What dedupes: the JA4+UA cluster for a scan, the finding-set hash for an
  -- audit rule, null for the one-open-row rules.
  cluster_key   text,
  -- How many firings have updated this row. A scan still running shows here.
  recent_count  int not null default 1,
  detected_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolution    text,
  -- When the hourly critical email went out for this row. Null = not yet.
  notified_at   timestamptz
);
comment on table security_anomalies is
  'Open and resolved security findings: probe clusters, detector health, weekly schema audit. Read on /admin/security.';
create index if not exists security_anomalies_open_idx
  on security_anomalies (detected_at desc) where resolved_at is null;
create index if not exists security_anomalies_rule_key_idx
  on security_anomalies (rule, cluster_key) where resolved_at is null;
create index if not exists security_anomalies_recent_idx
  on security_anomalies (updated_at desc);
alter table security_anomalies enable row level security;
-- No policies: the admin page and the detector use the service role, and
-- nothing in a browser has business reading what we know about attackers.

-- ── Probe events: one row per (firing, actor IP) ─────────────────────────────
create table if not exists security_probe_events (
  id                  bigint generated always as identity primary key,
  firing_id           uuid not null,
  detected_at         timestamptz not null default now(),
  window_start        timestamptz not null,
  window_end          timestamptz not null,
  cluster_key         text not null,
  cluster_label       text not null,
  cluster_score       int not null,
  severity            text not null check (severity in ('info', 'warning', 'critical')),
  actor_ip            inet not null,
  asn_org             text,
  country             text,
  ja4                 text,
  user_agent          text,
  requests            int not null default 0,
  ip_score            int not null default 0,
  signals             jsonb not null default '{}',
  top_paths           jsonb not null default '[]',
  first_seen          timestamptz,
  last_seen           timestamptz,
  -- A 2xx write on a table from this IP. Not scored; it is the one thing the
  -- card insists you look at before closing it.
  check_flag          boolean not null default false,
  -- Scored by a manual backfill rather than a live firing.
  backfill            boolean not null default false,
  -- Reserved for Layer 2 (an edge challenge); nothing writes them yet.
  response_action     text,
  cf_rule_id          text,
  response_expires_at timestamptz
);
comment on table security_probe_events is
  'One row per scanning IP per detector firing. 90-day self-prune. The card on /admin/security expands a cluster into these.';
-- The card: a cluster's IPs, newest firing first.
create index if not exists security_probe_events_cluster_idx on security_probe_events (cluster_key, detected_at desc);
-- "Have we seen this IP before?"
create index if not exists security_probe_events_ip_idx on security_probe_events (actor_ip, detected_at desc);
-- The prune, and the tiles.
create index if not exists security_probe_events_detected_idx on security_probe_events (detected_at desc);
alter table security_probe_events enable row level security;

-- ── Allowlists ───────────────────────────────────────────────────────────────
-- Ranges that never score: home, office, the CI runner's egress. Empty until
-- somebody here probes the site on purpose; the detector excludes our own
-- edge functions and the known crawlers by user agent and network already.
create table if not exists security_probe_allowlist (
  cidr      cidr primary key,
  reason    text not null,
  added_at  timestamptz not null default now(),
  added_by  text
);
alter table security_probe_allowlist enable row level security;

-- Layer 0 findings an admin has looked at and accepted, with the reason. A
-- finding on this list stops raising; remove the row and the next weekly run
-- raises it again.
create table if not exists security_audit_allowlist (
  kind         text not null check (kind in ('rpc', 'bucket_mime', 'policy')),
  item         text not null,
  reason       text not null,
  reviewed_at  timestamptz not null default now(),
  reviewed_by  text,
  primary key (kind, item)
);
alter table security_audit_allowlist enable row level security;

-- The detector's heartbeat. Merged server-side by probe_detector_state_merge
-- so two overlapping firings cannot lose each other's fields. app_config has
-- RLS on and no policies, so nothing public reads it.
insert into app_config (key, value) values ('probe_detector_state', '{}'::jsonb)
on conflict (key) do nothing;

-- ── Raising and resolving ────────────────────────────────────────────────────

-- The one way a finding becomes a card. Dedupe: an open row for the same rule
-- and cluster_key, updated within p_dedupe_hours (null = any open row), is
-- updated in place: severity only ever climbs, the message is replaced, the
-- count goes up. A row that climbs to critical is un-notified so the hourly
-- email picks the escalation up.
create or replace function public.security_anomaly_raise(
  p_stream       text,
  p_rule         text,
  p_severity     text,
  p_message      text,
  p_cluster_key  text default null,
  p_dedupe_hours int  default 6
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       bigint;
  v_old_sev  text;
  v_new_sev  text;
begin
  select id, severity into v_id, v_old_sev
    from security_anomalies
   where rule = p_rule
     and cluster_key is not distinct from p_cluster_key
     and resolved_at is null
     and (p_dedupe_hours is null or updated_at > now() - make_interval(hours => p_dedupe_hours))
   order by detected_at desc
   limit 1;

  if v_id is null then
    insert into security_anomalies (stream, rule, severity, message, cluster_key)
    values (p_stream, p_rule, p_severity, p_message, p_cluster_key)
    returning id into v_id;
    return v_id;
  end if;

  v_new_sev := case
    when 'critical' in (v_old_sev, p_severity) then 'critical'
    when 'warning'  in (v_old_sev, p_severity) then 'warning'
    else 'info' end;

  update security_anomalies
     set severity     = v_new_sev,
         message      = p_message,
         recent_count = recent_count + 1,
         updated_at   = now(),
         notified_at  = case when v_new_sev = 'critical' and v_old_sev <> 'critical' then null else notified_at end
   where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.security_anomaly_raise(text, text, text, text, text, int) from public, anon, authenticated;
grant execute on function public.security_anomaly_raise(text, text, text, text, text, int) to service_role;

-- Close every open row of a rule (optionally one cluster) with a reason.
-- Used by the recovery conditions; an admin resolving by hand writes the row
-- directly from the admin action.
create or replace function public.security_anomaly_resolve_rule(
  p_rule        text,
  p_cluster_key text default null,
  p_resolution  text default 'recovered'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update security_anomalies
     set resolved_at = now(), resolution = p_resolution
   where rule = p_rule
     and resolved_at is null
     and (p_cluster_key is null or cluster_key = p_cluster_key);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.security_anomaly_resolve_rule(text, text, text) from public, anon, authenticated;
grant execute on function public.security_anomaly_resolve_rule(text, text, text) to service_role;

-- ── Heartbeat ────────────────────────────────────────────────────────────────

-- `value || patch`, server side. A read-modify-write from the function could
-- lose last_success_end when two firings overlap, and a lost last_success_end
-- is exactly what silences the blind alarm.
create or replace function public.probe_detector_state_merge(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'probe_detector_state_merge: patch must be a JSON object';
  end if;
  insert into app_config (key, value) values ('probe_detector_state', p_patch)
  on conflict (key) do update
    set value      = coalesce(app_config.value, '{}'::jsonb) || excluded.value,
        updated_at = now()
  returning value into v;
  return v;
end;
$$;
revoke all on function public.probe_detector_state_merge(jsonb) from public, anon, authenticated;
grant execute on function public.probe_detector_state_merge(jsonb) to service_role;

-- The Management API token, for the detector when its MGMT_API_TOKEN secret
-- is unset. Service role only, and says so twice: EXECUTE is granted to the
-- service role alone, and the body checks the JWT role as well, because
-- default privileges have granted anon EXECUTE on new functions here before.
create or replace function public.get_mgmt_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  if session_user <> 'postgres'
     and coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role' is distinct from 'service_role' then
    raise exception 'get_mgmt_token: service role only';
  end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = 'supabase_mgmt_token';
  return v;
end;
$$;
revoke all on function public.get_mgmt_token() from public, anon, authenticated;
grant execute on function public.get_mgmt_token() to service_role;

-- ── The blind watchdog ───────────────────────────────────────────────────────

-- Hourly. "No scan found anything" and "the scanner has stopped" are the same
-- empty table everywhere else. Each JSON field is parsed in its own block so
-- a hand-edited value cannot abort the cron command.
create or replace function public.detect_probe_detector_gap()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state        jsonb;
  v_row_updated  timestamptz;
  v_last_ok      timestamptz;
  v_last_fail    timestamptz;
  v_failures     int;
  v_detail       text;
  v_msg          text;
begin
  select value, updated_at into v_state, v_row_updated
    from app_config where key = 'probe_detector_state';
  if v_state is null then
    -- The row from this migration is missing altogether: that is a fault.
    perform security_anomaly_raise('security_probe', 'probe_detector_blind', 'critical',
      'The probe detector has no heartbeat row (app_config.probe_detector_state). Re-run the security migration.',
      null, null);
    return;
  end if;

  begin v_last_ok := (v_state ->> 'last_success_end')::timestamptz; exception when others then v_last_ok := null; end;
  begin v_last_fail := (v_state ->> 'last_failure_at')::timestamptz; exception when others then v_last_fail := null; end;
  begin v_failures := coalesce((v_state ->> 'consecutive_failures')::int, 0); exception when others then v_failures := 0; end;
  v_detail := left(coalesce(v_state ->> 'last_failure_detail', ''), 300);

  if v_last_ok is not null and v_last_ok >= now() - interval '60 minutes' then
    perform security_anomaly_resolve_rule('probe_detector_blind', null, 'heartbeat fresh again');
    return;
  end if;

  -- Never succeeded: 60 minutes of grace from the first failure, or from the
  -- row being created if it has never even failed (a cron that is not firing
  -- looks like that).
  if v_last_ok is null then
    if coalesce(v_last_fail, v_row_updated) >= now() - interval '60 minutes' then
      return;
    end if;
    v_msg := format(
      'The probe detector has never completed a scan. %s failure(s) so far; row created %s. %s',
      v_failures, to_char(v_row_updated at time zone 'UTC', 'DD Mon HH24:MI "UTC"'),
      case when v_detail = '' then 'No error recorded: is the detect-probe-activity cron firing?' else 'Last error: ' || v_detail end);
  else
    v_msg := format(
      'No probe scan has succeeded since %s (%s ago). %s consecutive failure(s).%s',
      to_char(v_last_ok at time zone 'UTC', 'DD Mon HH24:MI "UTC"'),
      regexp_replace(age(now(), v_last_ok)::text, '\.\d+', ''),
      v_failures,
      case when v_detail = '' then '' else ' Last error: ' || v_detail end);
  end if;

  perform security_anomaly_raise('security_probe', 'probe_detector_blind', 'critical', v_msg, null, null);
end;
$$;
revoke all on function public.detect_probe_detector_gap() from public, anon, authenticated;

-- ── Layer 0: the schema audit ────────────────────────────────────────────────

-- Is this policy expression open to anyone who can sign up? `true`, or only
-- an "is signed in" test. A bare signed-in check counts as open because
-- anyone can sign up: that is the hole the source system's fake notifications
-- went through.
create or replace function public.policy_expr_is_open(p_expr text)
returns boolean
language plpgsql
immutable
as $$
declare
  s text;
begin
  if p_expr is null then return true; end if;
  s := lower(p_expr);
  s := replace(s, '::text', '');
  s := regexp_replace(s, '\s+', '', 'g');
  -- Strip matched outer parentheses, however many layers.
  while length(s) > 1 and left(s, 1) = '(' and right(s, 1) = ')' loop
    s := substr(s, 2, length(s) - 2);
  end loop;
  return s in (
    'true',
    'auth.uid()isnotnull',
    'auth.jwt()isnotnull',
    'auth.role()=''authenticated''',
    '''authenticated''=auth.role()',
    'auth.role()isnotnull'
  );
end;
$$;
-- Pure and harmless, but nothing public needs it and default privileges
-- would otherwise hand anon EXECUTE (20260922, PostgREST anon exposure).
revoke all on function public.policy_expr_is_open(text) from public, anon, authenticated;

-- One audit rule's findings become one card. Same set as the open card: a
-- no-op. A changed set: the old card is closed as superseded and a new one
-- opened. An empty set: the open card closes.
create or replace function public.security_audit_raise(p_rule text, p_findings text[], p_remedy text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sorted  text[];
  v_key     text;
  v_open    security_anomalies%rowtype;
begin
  if p_findings is null or cardinality(p_findings) = 0 then
    perform security_anomaly_resolve_rule(p_rule, null, 'no findings on re-run');
    return;
  end if;

  select array_agg(f order by f) into v_sorted from unnest(p_findings) f;
  v_key := md5(array_to_string(v_sorted, '|'));

  select * into v_open from security_anomalies
   where rule = p_rule and resolved_at is null
   order by detected_at desc limit 1;

  if v_open.id is not null and v_open.cluster_key = v_key then
    update security_anomalies set updated_at = now(), recent_count = recent_count + 1 where id = v_open.id;
    return;
  end if;
  if v_open.id is not null then
    update security_anomalies set resolved_at = now(), resolution = 'superseded by a changed finding set' where id = v_open.id;
  end if;

  insert into security_anomalies (stream, rule, severity, message, cluster_key)
  values ('security_audit', p_rule, 'warning',
    format('%s to review: %s. %s',
      case when cardinality(v_sorted) = 1 then '1 item' else cardinality(v_sorted) || ' items' end,
      array_to_string(v_sorted, '; '), p_remedy),
    v_key);
end;
$$;
revoke all on function public.security_audit_raise(text, text[], text) from public, anon, authenticated;

-- Weekly. Three questions of the catalog, each diffed against the allowlist,
-- each in its own block so one failing cannot roll the others back.
create or replace function public.audit_anon_writable_rpcs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rpcs      text[];
  v_buckets   text[];
  v_policies  text[];
  v_errors    text[] := '{}';
begin
  -- 1. Writer RPCs callable from the API with no caller check.
  begin
    select coalesce(array_agg(item order by item), '{}') into v_rpcs
    from (
      select p.oid::regprocedure::text as item
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prosecdef
         and p.provolatile = 'v'
         and p.prorettype <> 'trigger'::regtype
         and p.prokind = 'f'
         and (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute'))
         and pg_get_functiondef(p.oid) ~* '\m(update|insert|delete)\M'
         and pg_get_functiondef(p.oid) !~* '(auth\.uid|auth\.role|auth\.jwt|request\.jwt|is_admin)'
    ) f
    where not exists (select 1 from security_audit_allowlist a where a.kind = 'rpc' and a.item = f.item);
    perform security_audit_raise('anon_writable_rpc', v_rpcs,
      'Each writes without checking who is calling. Add an auth.uid()/is_admin() guard, or revoke EXECUTE from anon and authenticated, or allowlist it with a reason on /admin/security/audit.');
  exception when others then
    v_errors := v_errors || ('rpc: ' || sqlerrm);
  end;

  -- 2. Public buckets that would serve script or markup.
  begin
    select coalesce(array_agg(item order by item), '{}') into v_buckets
    from (
      select b.id || ':' || coalesce(m.mime, '*') as item
        from storage.buckets b
        left join lateral (
          select unnest(b.allowed_mime_types) as mime
        ) m on true
       where b.public
         and (b.allowed_mime_types is null
              or lower(m.mime) ~ '(svg|html|xhtml|javascript|ecmascript|php)')
    ) f
    where not exists (select 1 from security_audit_allowlist a where a.kind = 'bucket_mime' and a.item = f.item);
    perform security_audit_raise('bucket_active_content', v_buckets,
      'A public bucket serving SVG, HTML, JavaScript or PHP is a hosted payload. Set allowed_mime_types to the image types the feature uploads (bucket:* means it accepts anything).');
  exception when others then
    v_errors := v_errors || ('bucket: ' || sqlerrm);
  end;

  -- 3. Write policies open to any account, on tables the API roles can write.
  begin
    select coalesce(array_agg(item order by item), '{}') into v_policies
    from (
      select format('%s.%s (%s)', p.tablename, p.policyname, p.cmd) as item
        from pg_policies p
       where p.schemaname = 'public'
         and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
         and p.roles && array['anon', 'authenticated', 'public']::name[]
         and case p.cmd
               when 'INSERT' then policy_expr_is_open(coalesce(p.with_check, p.qual))
               else policy_expr_is_open(p.qual)
             end
         and exists (
           select 1 from unnest(array['anon', 'authenticated']) r
            where case p.cmd
                    when 'ALL' then has_table_privilege(r, format('%I.%I', p.schemaname, p.tablename), 'INSERT, UPDATE, DELETE')
                    else has_table_privilege(r, format('%I.%I', p.schemaname, p.tablename), p.cmd)
                  end)
    ) f
    where not exists (select 1 from security_audit_allowlist a where a.kind = 'policy' and a.item = f.item);
    perform security_audit_raise('permissive_write_policy', v_policies,
      'The policy lets any account, or anyone at all, write these rows. Scope it to the owner (auth.uid()) or an admin check; "signed in" is not a check because anyone can sign up.');
  exception when others then
    v_errors := v_errors || ('policy: ' || sqlerrm);
  end;

  if cardinality(v_errors) > 0 then
    perform security_anomaly_raise('security_audit', 'audit_failed', 'warning',
      'The weekly schema audit could not complete: ' || array_to_string(v_errors, '; '), null, null);
  else
    perform security_anomaly_resolve_rule('audit_failed', null, 'audit ran clean');
  end if;

  return jsonb_build_object(
    'rpcs', coalesce(v_rpcs, '{}'),
    'buckets', coalesce(v_buckets, '{}'),
    'policies', coalesce(v_policies, '{}'),
    'errors', v_errors);
end;
$$;
revoke all on function public.audit_anon_writable_rpcs() from public, anon, authenticated;
grant execute on function public.audit_anon_writable_rpcs() to service_role;

-- ── Alerts, through the queue the rest of the site already uses ──────────────

-- Hourly. New criticals go to the admin as admin_direct emails, at most one
-- per rule per 24 h, so a two-hour scan is one email and a flapping detector
-- is not twenty.
create or replace function public.security_critical_email_tick()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  n      int := 0;
  v_site text;
begin
  select decrypted_secret into v_site from vault.decrypted_secrets where name = 'project_url';
  for r in
    select a.*
      from security_anomalies a
     where a.severity = 'critical'
       and a.resolved_at is null
       and a.notified_at is null
       and not exists (
         select 1 from security_anomalies b
          where b.rule = a.rule and b.notified_at > now() - interval '24 hours')
     order by a.detected_at
  loop
    insert into pending_emails (kind, to_email, payload)
    values ('admin_direct', '__admin__', jsonb_build_object(
      'subject', 'Security: ' || case r.rule
          when 'probe_scan' then 'scan detected'
          when 'probe_detector_blind' then 'the probe detector has stopped'
          else replace(r.rule, '_', ' ') end,
      'text',
        r.message || E'\n\n' ||
        'Raised ' || to_char(r.detected_at at time zone 'Europe/London', 'DD Mon HH24:MI') ||
        case when r.recent_count > 1 then ', updated ' || r.recent_count || ' times' else '' end || E'.\n' ||
        'Review it at https://www.emmerdaleagriculture.com/admin/security'));
    update security_anomalies set notified_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.security_critical_email_tick() from public, anon, authenticated;

-- 07:00 daily. Everything raised, updated or resolved in the last 24 h, by
-- severity, plus the detector's coverage. Sent only when there is something
-- to say: the watchdog is the proof of life, not this.
create or replace function public.security_daily_digest_tick()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body   text := '';
  v_count  int;
  v_state  jsonb;
  v_last   timestamptz;
  v_events int;
  r        record;
begin
  select count(*) into v_count from security_anomalies
   where greatest(detected_at, updated_at, coalesce(resolved_at, detected_at)) > now() - interval '24 hours';

  select value into v_state from app_config where key = 'probe_detector_state';
  begin v_last := (v_state ->> 'last_success_end')::timestamptz; exception when others then v_last := null; end;

  if v_count = 0 and v_last is not null and v_last > now() - interval '60 minutes' then
    return false;
  end if;

  for r in
    select severity, rule, message, recent_count, resolved_at, resolution
      from security_anomalies
     where greatest(detected_at, updated_at, coalesce(resolved_at, detected_at)) > now() - interval '24 hours'
     order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end, detected_at desc
  loop
    v_body := v_body || upper(r.severity) || ' ' || r.rule ||
      case when r.resolved_at is not null then ' (resolved: ' || coalesce(r.resolution, 'closed') || ')' else '' end ||
      E'\n  ' || regexp_replace(r.message, '\s*\[cluster:[^\]]*\]\s*$', '') || E'\n\n';
  end loop;
  if v_body = '' then v_body := E'No security findings in the last 24 hours.\n\n'; end if;

  select count(*) into v_events from security_probe_events where detected_at > now() - interval '24 hours';
  v_body := v_body ||
    'Detector: ' ||
    case when v_last is null then 'has never completed a scan'
         else 'last successful scan to ' || to_char(v_last at time zone 'Europe/London', 'DD Mon HH24:MI') end ||
    '; ' || v_events || ' scanning IP row(s) recorded in 24 h.' || E'\n' ||
    'https://www.emmerdaleagriculture.com/admin/security';

  insert into pending_emails (kind, to_email, payload)
  values ('admin_direct', '__admin__', jsonb_build_object(
    'subject', 'Security digest: ' || v_count || ' finding(s) in 24 h',
    'text', v_body));
  return true;
end;
$$;
revoke all on function public.security_daily_digest_tick() from public, anon, authenticated;

-- ── Firing the detector ──────────────────────────────────────────────────────

-- Same shape as drain_emails_tick: URL and secret from Vault, pg_net does the
-- POST. 60 s because a catch-up window can take the Analytics API a while.
create or replace function public.probe_detector_tick()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  base   text;
  secret text;
begin
  select decrypted_secret into base   from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or base = '' then
    raise exception 'vault secret "project_url" is not set: the probe detector has no URL to call';
  end if;
  if secret is null or secret = '' then
    raise exception 'vault secret "cron_secret" is not set: detect-probe-activity would answer 403';
  end if;
  return net.http_post(
    url     := rtrim(base, '/') || '/functions/v1/detect-probe-activity',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.probe_detector_tick() from public, anon, authenticated;

-- ── Hardening the audit would have flagged today ─────────────────────────────
-- notes-media is public and accepted any type. Only the admin notes editor
-- uploads to it, and it accepts these four (admin/notes/actions.ts), so this
-- costs nothing and closes the one finding a first run would have raised.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
 where id = 'notes-media' and allowed_mime_types is null;

-- ── Schedules ────────────────────────────────────────────────────────────────
-- Minutes chosen off the :00/:15/:30 slots the other jobs crowd. The watchdog
-- at :29 runs before the critical email at :28 of the next hour picks it up.
do $$
declare
  j record;
begin
  for j in
    select * from (values
      ('detect-probe-activity',    '7,22,37,52 * * * *', 'select public.probe_detector_tick();'),
      ('security-watchdog',        '29 * * * *',         'select public.detect_probe_detector_gap();'),
      ('security-critical-email',  '28 * * * *',         'select public.security_critical_email_tick();'),
      ('security-daily-digest',    '0 7 * * *',          'select public.security_daily_digest_tick();'),
      ('security-audit',           '47 5 * * 1',         'select public.audit_anon_writable_rpcs();'),
      ('prune-security-events',    '41 3 * * *',
        'delete from public.security_probe_events where detected_at < now() - interval ''90 days''; ' ||
        'delete from public.security_anomalies where resolved_at < now() - interval ''90 days'';')
    ) as t(name, schedule, command)
  loop
    if exists (select 1 from cron.job where jobname = j.name) then
      perform cron.unschedule(j.name);
    end if;
    perform cron.schedule(j.name, j.schedule, j.command);
  end loop;
end $$;

-- Run the audit once now, so the first card (if any) is waiting on the tab
-- rather than next Monday.
select public.audit_anon_writable_rpcs();
