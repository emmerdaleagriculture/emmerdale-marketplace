-- ============================================================================
-- Landing page spec v1.3: area verification + variation prevention (Part 1).
--
-- Payment is taken in full up front in Part 3, so a wrong acreage becomes a
-- top-up charge and a contractor standing in a field — the spec therefore
-- reverses the earlier decision and makes boundary drawing mandatory for
-- area-priced services (§7, §26a). The polygon geometry itself is stored, not
-- just the computed number: contractors need to see the shape, and it is the
-- evidence if area is later disputed.
--
-- Photos (field + gateway/access, §26a.3) are stored, never parsed, and will
-- be shown to contractors in Part 2 invitations. Private bucket, no storage
-- policies → service-role access only (uploads go through the server action).
-- ============================================================================

-- ── Boundary + mapped area ──────────────────────────────────────────────────
alter table job_submissions add column if not exists area_mapped_value numeric;
alter table job_submissions add column if not exists boundary jsonb;  -- GeoJSON Polygon

-- area_source grows the 'mapped' and 'both' states (§5): downstream pricing
-- must know whether it is holding an estimate or a measurement.
alter table job_submissions drop constraint if exists job_submissions_area_source_check;
alter table job_submissions add constraint job_submissions_area_source_check
  check (area_source in ('stated','mapped','both'));

-- ── Gate / access details ───────────────────────────────────────────────────
-- Access is the variation cause the polygon cannot touch (§26a.3): a
-- what3words square for the gate itself, and a tap-to-answer width band —
-- what a contractor actually needs to know is "does the machine fit".
alter table job_submissions add column if not exists gate_w3w text;  -- word.word.word, format-validated
alter table job_submissions add column if not exists gate_width text;
alter table job_submissions drop constraint if exists job_submissions_gate_width_check;
alter table job_submissions add constraint job_submissions_gate_width_check
  check (gate_width in ('standard','wide','narrow','none','unsure'));

-- ── Photos ──────────────────────────────────────────────────────────────────
alter table job_submissions add column if not exists photo_paths text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos', 'job-photos', false,
  10485760,  -- 10MB per object; the client downscales before upload anyway
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;
