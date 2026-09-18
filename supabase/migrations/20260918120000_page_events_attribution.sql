-- ============================================================================
-- Where a behavioural visit came from.
--
-- page_events knows what a visit DID — typed, pressed Send, drew the field —
-- and landing_views knows where arrivals came FROM. Neither knows both, so the
-- people who typed into the box and left without submitting could be counted
-- but never attributed: they create no job_submissions row, and the beacon
-- carried no channel.
--
-- DELIBERATELY NOT THE RAW gclid. This table's whole premise is that it is not
-- a person — no IP, no user id, no fingerprint — and a gclid is a per-click
-- identifier that would undo that next to click coordinates and dwell times.
-- A boolean answers the only question being asked ("was this a Google Ads
-- click?") and identifies nobody. utm_source/medium are campaign labels, not
-- identifiers, so they are stored as they arrive.
-- ============================================================================

alter table page_events add column if not exists utm_source text;
alter table page_events add column if not exists utm_medium text;
alter table page_events add column if not exists has_gclid  boolean;

-- The question this exists to answer is "which channel did the sessions that
-- reached milestone X come from", so the index matches that shape.
create index if not exists page_events_attribution_idx
  on page_events (path, utm_source, session_key) where kind = 'step';

-- Length is clamped in /api/track too; this is the backstop for anything that
-- reaches the table another way. Campaign names are short — 200 is generous.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'page_events_utm_len_check') then
    alter table page_events add constraint page_events_utm_len_check
      check (
        (utm_source is null or length(utm_source) <= 200) and
        (utm_medium is null or length(utm_medium) <= 200)
      );
  end if;
end $$;

-- Existing rows keep NULL rather than being guessed at: they were recorded
-- before the beacon sent a channel, and inventing one would quietly corrupt
-- every rate computed from this column.
