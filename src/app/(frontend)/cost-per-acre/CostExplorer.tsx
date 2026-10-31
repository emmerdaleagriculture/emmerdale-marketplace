'use client';

import { useMemo, useState, type CSSProperties, type PointerEvent, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  type CostSnapshot,
  type Rate,
  countiesWithData,
  countyAverages,
  countyRates,
  countyVar,
  jobsLabel,
  pounds,
  range,
  rateBinsInUse,
  rateFill,
  regionRates,
  servicesByJobs,
} from '@/lib/costPerAcre/model';
import css from './costPerAcre.module.css';

/**
 * The interactive half of /cost-per-acre: pick a job, the map shades every
 * county with a figure for it; tap (or choose) a county and its figures for
 * every job appear beside the region's for comparison.
 *
 * The map itself is server-rendered and passed in as `map`: the county
 * outlines are 120KB of path data that should reach the browser once, in the
 * HTML, not again in this bundle. Each path paints with
 * `fill: var(--c-<county>)`, so recolouring is a set of CSS variables on the
 * wrapper, and a tap is one delegated handler reading `data-county`.
 */
export function CostExplorer({
  snapshot,
  map,
  servicePaths,
}: {
  snapshot: CostSnapshot;
  map: ReactNode;
  /** Service name to its /services page, for the links in the panel. */
  servicePaths: Record<string, string>;
}) {
  const services = useMemo(() => servicesByJobs(snapshot), [snapshot]);
  const counties = useMemo(() => countiesWithData(snapshot), [snapshot]);
  const [serviceId, setServiceId] = useState<number>(services[0]?.serviceId ?? 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const byCounty = useMemo(() => countyAverages(snapshot, serviceId), [snapshot, serviceId]);
  const service = services.find((s) => s.serviceId === serviceId);
  const bins = rateBinsInUse(byCounty);

  // The wrapper's style: a fill per county with a figure, and a stroke for
  // the chosen one. Counties without a figure fall back to the path's own
  // neutral default.
  const vars: Record<string, string> = {};
  for (const [name, r] of Object.entries(byCounty)) vars[countyVar(name)] = rateFill(r.avg);
  if (selected) {
    vars[`${countyVar(selected)}-s`] = '#ffde00';
    vars[`${countyVar(selected)}-w`] = '2.5';
  }

  const countyAt = (e: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>) =>
    (e.target as Element).closest?.('path[data-county]')?.getAttribute('data-county') ?? null;

  const captionFor = (name: string | null) => {
    if (!name) return 'Hover or tap a county.';
    const r = byCounty[name];
    if (!r) return `${name}: no ${service?.service.toLowerCase() ?? ''} priced here yet.`;
    return `${name}: ${pounds(r.avg)} an acre on average (${jobsLabel(r.jobs)}).`;
  };

  const selectedRates = selected ? countyRates(snapshot, selected) : [];
  const selectedRegion = selectedRates[0]?.region ?? null;
  const regionComparison = selectedRegion ? regionRates(snapshot, selectedRegion) : [];

  return (
    <>
      <div className={css.chips} role="group" aria-label="Choose a job">
        {services.map((s) => (
          <button
            key={s.serviceId}
            type="button"
            onClick={() => setServiceId(s.serviceId)}
            aria-pressed={s.serviceId === serviceId}
            className={`${css.chip} ${s.serviceId === serviceId ? css.chipOn : ''}`}
          >
            {s.service}
            <span className={css.chipN}>{s.jobs}</span>
          </button>
        ))}
      </div>

      <div className={css.explorer}>
        <div className={css.mapCol}>
          <div
            className={css.mapWrap}
            style={vars as CSSProperties}
            onClick={(e) => {
              const name = countyAt(e);
              if (name) setSelected(name);
            }}
            onPointerOver={(e) => setHovered(countyAt(e))}
            onPointerLeave={() => setHovered(null)}
          >
            {map}
          </div>
          <p className={css.caption} aria-live="polite">
            {captionFor(hovered ?? selected)}
          </p>
          {bins.length > 0 && (
            <ul className={css.legend} aria-label="Map key">
              {bins.map((b) => (
                <li key={b.label} className={css.legendItem}>
                  <span className={css.swatch} style={{ background: b.fill }} aria-hidden="true" />
                  {b.label}
                </li>
              ))}
              <li className={css.legendItem}>
                <span className={css.swatch} style={{ background: rateFill(undefined) }} aria-hidden="true" />
                No figure yet
              </li>
            </ul>
          )}
        </div>

        <div className={css.panel}>
          <label className={css.panelLabel} htmlFor="cpa-county">
            County
          </label>
          <select
            id="cpa-county"
            className={css.select}
            value={selected ?? ''}
            onChange={(e) => setSelected(e.target.value || null)}
          >
            <option value="">Pick a county with a figure</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {selected && selectedRates.length > 0 ? (
            <>
              <h3 className={css.panelTitle}>{selected}</h3>
              <p className={css.panelSub}>
                {selectedRegion}. Average of what customers were quoted, per acre.
              </p>
              <RateTable rates={selectedRates} servicePaths={servicePaths} />
              {regionComparison.length > 0 && (
                <>
                  <h4 className={css.panelH}>Across {selectedRegion}</h4>
                  <RateTable rates={regionComparison} servicePaths={servicePaths} />
                </>
              )}
              <Link href="/start" className={css.cta}>
                Get prices for your land
              </Link>
            </>
          ) : service ? (
            <>
              <h3 className={css.panelTitle}>{service.service} across the UK</h3>
              <p className={css.panelSub}>
                {pounds(service.avg)} an acre on average, {pounds(service.median)} typical, from{' '}
                {jobsLabel(service.jobs)} in {Object.keys(byCounty).length}{' '}
                {Object.keys(byCounty).length === 1 ? 'county' : 'counties'}.
              </p>
              <p className={css.empty}>
                Tap a shaded county on the map, or choose one above, to see every job priced there.
              </p>
            </>
          ) : (
            <p className={css.empty}>No figures yet.</p>
          )}
        </div>
      </div>
    </>
  );
}

function RateTable({ rates, servicePaths }: { rates: Rate[]; servicePaths: Record<string, string> }) {
  return (
    <table className={css.table}>
      <thead>
        <tr>
          <th scope="col">Job</th>
          <th scope="col" className={css.num}>
            Average
          </th>
          <th scope="col" className={css.num}>
            Range
          </th>
          <th scope="col" className={css.num}>
            Jobs
          </th>
        </tr>
      </thead>
      <tbody>
        {rates.map((r) => (
          <tr key={`${r.scope}-${r.serviceId}`}>
            <td>
              {servicePaths[r.service] ? <Link href={servicePaths[r.service]}>{r.service}</Link> : r.service}
            </td>
            <td className={`${css.num} ${css.avg}`}>{pounds(r.avg)}</td>
            <td className={`${css.num} ${css.muted}`}>{range(r)}</td>
            <td className={css.num}>{r.jobs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
