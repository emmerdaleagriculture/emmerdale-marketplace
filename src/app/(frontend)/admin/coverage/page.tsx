import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { landCoverage } from '@/lib/radiusCoverage';
import { UKCoverageMap } from '@/components/UKCoverageMap';
import { COVERAGE_BINS, UK_COUNTY_NAMES } from '@/lib/coverage';
import { RadiusMap, type MapContractor } from './RadiusMap';
import s from '../admin.module.css';
import c from './coverage.module.css';

export const metadata: Metadata = { title: 'Coverage — Admin' };

/** 20 is the question asked; 62 is the furthest a contractor will travel. */
const RADII = [10, 20, 30, 62];
const DEFAULT_RADIUS = 20;

/** The three questions a map of this business can answer. */
const VIEWS = [
  ['reach', 'Reach', 'Where contractors are based, and how far they will travel'],
  ['contractors', 'Contractors', 'Counties a contractor has ticked'],
  ['jobs', 'Jobs', 'Counties work has actually come from'],
] as const;
type View = (typeof VIEWS)[number][0];

/**
 * Every map in the admin, in one place.
 *
 * There were three, in three places, and one of them was called by a fourth
 * name. The contractors page drew a county choropleth of ticked counties; the
 * dashboard drew the same component over job counts and linked to the
 * contractors page calling it "coverage map"; this page drew radius circles.
 * Three answers to "where is this business" that you could not put side by
 * side, on pages you reached from three different parts of the menu.
 *
 * Reach is the default because it is the one the others cannot give: ticked
 * counties are a claim, and a job count is history, but a circle round a base
 * is where somebody actually is. It ignores the counties a contractor ticked
 * on purpose — where they are, not where they said they go.
 */
export default async function AdminCoveragePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const view: View = VIEWS.some(([k]) => k === sp.view) ? (sp.view as View) : 'reach';

  const admin = createServiceRoleClient();
  const [{ data: rows }, { data: counties }, { data: dash }] = await Promise.all([
    admin
      .from('contractors')
      .select('id, business_name, base_postcode, base_lat, base_lng')
      .eq('status', 'approved')
      .not('vetted_at', 'is', null)
      .order('business_name'),
    admin.from('counties').select('name, country'),
    // Carries jobs AND contractors per county, so one call feeds both
    // choropleths rather than each page computing its own.
    admin.rpc('admin_dashboard'),
  ]);

  const contractors = rows ?? [];
  const plotted: MapContractor[] = contractors
    .filter((r) => r.base_lat != null && r.base_lng != null)
    .map((r) => ({
      id: r.id,
      name: r.business_name,
      postcode: r.base_postcode,
      lat: Number(r.base_lat),
      lng: Number(r.base_lng),
    }));
  const missing = contractors.filter((r) => r.base_lat == null || r.base_lng == null);

  const countryOf = Object.fromEntries((counties ?? []).map((co) => [co.name, co.country]));
  const coverage = RADII.map((radius) => landCoverage(plotted, radius, countryOf));

  // Per-county counts for the two choropleths, from the one dashboard read.
  const dashCounties = ((dash as { counties?: { name: string; jobs: number; contractors: number }[] } | null)
    ?.counties ?? []);
  const byContractors: Record<string, number> = {};
  const byJobs: Record<string, number> = {};
  for (const co of dashCounties) {
    if (co.contractors > 0) byContractors[co.name] = co.contractors;
    if (co.jobs > 0) byJobs[co.name] = co.jobs;
  }
  const counts = view === 'jobs' ? byJobs : byContractors;
  const withAny = UK_COUNTY_NAMES.filter((nm) => (counts[nm] ?? 0) > 0);
  const blurb = VIEWS.find(([k]) => k === view)![2];

  return (
    <div>
      <h1 className={s.h1}>Coverage</h1>
      <p className={s.sub}>{blurb}.</p>

      <nav className={c.views} aria-label="Map view">
        {VIEWS.map(([key, label]) => (
          <Link
            key={key}
            href={key === 'reach' ? '/admin/coverage' : `/admin/coverage?view=${key}`}
            className={view === key ? `${c.view} ${c.viewOn}` : c.view}
            aria-current={view === key ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {view === 'reach' ? (
        <>
          <p className={s.sub}>
            {plotted.length} approved contractors, each with a circle round their base. Blank map
            is country nobody is based near.
          </p>
          <RadiusMap
            contractors={plotted}
            radii={RADII}
            initialRadius={DEFAULT_RADIUS}
            coverage={coverage}
          />
        </>
      ) : (
        <div className={s.mapCard}>
          <div className={s.mapHead}>
            <span className={s.mapTitle}>
              {view === 'jobs' ? 'Jobs by county' : 'Contractors by county'}
            </span>
            <span className={s.mapStat}>
              {withAny.length} of {UK_COUNTY_NAMES.length} counties
              {view === 'jobs' ? ' have had a job' : ' have an approved contractor'}
            </span>
          </div>
          <div className={s.mapRow}>
            <UKCoverageMap counts={counts} className={s.map} pathClassName={s.mapCounty} showCounts />
            <div className={s.mapLegend}>
              {COVERAGE_BINS.map((b) => (
                <div key={b.label} className={s.mapLegendRow}>
                  <span className={s.mapSwatch} style={{ background: b.fill }} />
                  {b.label}
                </div>
              ))}
              <details className={s.mapList}>
                <summary>{view === 'jobs' ? 'Counties with work' : 'Covered counties'}</summary>
                <ul>
                  {withAny
                    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a.localeCompare(b))
                    .map((nm) => (
                      <li key={nm}>
                        {nm} · {counts[nm]}
                      </li>
                    ))}
                </ul>
              </details>
            </div>
          </div>
        </div>
      )}

      {view === 'reach' && missing.length > 0 && (
        <div className={c.missing}>
          Not on the map — no location for their base postcode:
          <ul>
            {missing.map((m) => (
              <li key={m.id}>
                <a href={`/admin/contractors/${m.id}`}>{m.business_name}</a> ({m.base_postcode})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
