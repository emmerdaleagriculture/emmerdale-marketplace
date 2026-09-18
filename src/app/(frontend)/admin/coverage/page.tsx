import type { Metadata } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { landCoverage } from '@/lib/radiusCoverage';
import { RadiusMap, type MapContractor } from './RadiusMap';
import s from '../admin.module.css';
import c from './coverage.module.css';

export const metadata: Metadata = { title: 'Coverage — Admin' };

/** 20 is the question asked; 62 is the furthest a contractor will travel. */
const RADII = [10, 20, 30, 62];
const DEFAULT_RADIUS = 20;

/**
 * Where the network physically is: every approved contractor's base with a
 * radius round it, and how much of Great Britain those circles reach. Unlike
 * the county choropleth on the contractors page, this ignores the counties a
 * contractor ticked — it is about where they are, not where they said they go.
 */
export default async function AdminCoveragePage() {
  const admin = createServiceRoleClient();
  const [{ data: rows }, { data: counties }] = await Promise.all([
    admin
      .from('contractors')
      .select('id, business_name, base_postcode, base_lat, base_lng')
      .eq('status', 'approved')
      .not('vetted_at', 'is', null)
      .order('business_name'),
    admin.from('counties').select('name, country'),
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

  return (
    <div>
      <h1 className={s.h1}>Coverage</h1>
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

      {missing.length > 0 && (
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
