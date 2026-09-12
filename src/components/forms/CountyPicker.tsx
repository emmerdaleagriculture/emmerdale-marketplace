'use client';

import { useRef, useState } from 'react';
import styles from './forms.module.css';
import cp from './CountyPicker.module.css';

export type CountyOption = { id: number; name: string; region: string };

/**
 * Region-grouped county multi-select with a select-all-per-region control
 * (spec §2.1 — "covering the whole South West is two clicks, not seven").
 *
 * Values submit as native checkboxes named `county_ids`, so a plain server
 * action reads them with formData.getAll('county_ids'). The select-all toggle
 * just checks/unchecks the region's boxes in the DOM.
 *
 * `collapsible` folds each region into a <details> showing how many of its
 * counties are ticked, open only where something already is — 170 checkboxes
 * made the account page 13,000px tall on a phone. Onboarding keeps the open
 * list, where choosing is the whole point.
 */
export function CountyPicker({
  counties,
  selected = [],
  collapsible = false,
}: {
  counties: CountyOption[];
  selected?: number[];
  collapsible?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selected);

  // Group by region, preserving the seeded order.
  const byRegion = new Map<string, CountyOption[]>();
  for (const c of counties) {
    if (!byRegion.has(c.region)) byRegion.set(c.region, []);
    byRegion.get(c.region)!.push(c);
  }

  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      Array.from(byRegion.entries()).map(([region, list]) => [
        region,
        list.filter((c) => selectedSet.has(c.id)).length,
      ]),
    ),
  );

  function regionBoxes(region: string) {
    return Array.from(
      rootRef.current?.querySelectorAll<HTMLInputElement>(
        `input[data-region="${CSS.escape(region)}"]`,
      ) ?? [],
    );
  }

  function recount(region: string) {
    const n = regionBoxes(region).filter((b) => b.checked).length;
    setCounts((prev) => (prev[region] === n ? prev : { ...prev, [region]: n }));
  }

  function toggleRegion(region: string) {
    const boxes = regionBoxes(region);
    const allOn = boxes.every((b) => b.checked);
    boxes.forEach((b) => {
      b.checked = !allOn;
    });
    recount(region);
  }

  const grid = (region: string, list: CountyOption[]) => (
    <div className={styles.countyGrid}>
      {list.map((c) => (
        <label key={c.id} className={styles.checkRow}>
          <input
            type="checkbox"
            name="county_ids"
            value={c.id}
            data-region={region}
            defaultChecked={selectedSet.has(c.id)}
          />
          <span>{c.name}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div
      ref={rootRef}
      onChange={(e) => {
        const region = (e.target as HTMLInputElement).dataset?.region;
        if (region) recount(region);
      }}
    >
      {Array.from(byRegion.entries()).map(([region, list]) =>
        collapsible ? (
          <details
            key={region}
            className={`${styles.regionGroup} ${cp.regionDetails}`}
            open={list.some((c) => selectedSet.has(c.id))}
          >
            <summary className={styles.regionHead}>
              <span className={styles.regionName}>{region}</span>
              <span className={`${cp.regionCount} ${counts[region] ? cp.regionCountOn : ''}`}>
                {counts[region] ? `${counts[region]} of ${list.length}` : 'None'}
              </span>
            </summary>
            <div className={cp.regionTools}>
              <button type="button" className={styles.selectAll} onClick={() => toggleRegion(region)}>
                Select all
              </button>
            </div>
            {grid(region, list)}
          </details>
        ) : (
          <fieldset key={region} className={styles.regionGroup}>
            <div className={styles.regionHead}>
              <legend className={styles.regionName}>{region}</legend>
              <button
                type="button"
                className={styles.selectAll}
                onClick={() => toggleRegion(region)}
              >
                Select all
              </button>
            </div>
            {grid(region, list)}
          </fieldset>
        ),
      )}
    </div>
  );
}
