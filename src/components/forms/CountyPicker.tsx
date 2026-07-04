'use client';

import { useRef } from 'react';
import styles from './forms.module.css';

export type CountyOption = { id: number; name: string; region: string };

/**
 * Region-grouped county multi-select with a select-all-per-region control
 * (spec §2.1 — "covering the whole South West is two clicks, not seven").
 *
 * Values submit as native checkboxes named `county_ids`, so a plain server
 * action reads them with formData.getAll('county_ids'). The select-all toggle
 * just checks/unchecks the region's boxes in the DOM.
 */
export function CountyPicker({
  counties,
  selected = [],
}: {
  counties: CountyOption[];
  selected?: number[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selected);

  // Group by region, preserving the seeded order.
  const byRegion = new Map<string, CountyOption[]>();
  for (const c of counties) {
    if (!byRegion.has(c.region)) byRegion.set(c.region, []);
    byRegion.get(c.region)!.push(c);
  }

  function toggleRegion(region: string) {
    const boxes = rootRef.current?.querySelectorAll<HTMLInputElement>(
      `input[data-region="${CSS.escape(region)}"]`,
    );
    if (!boxes) return;
    const allOn = Array.from(boxes).every((b) => b.checked);
    boxes.forEach((b) => {
      b.checked = !allOn;
    });
  }

  return (
    <div ref={rootRef}>
      {Array.from(byRegion.entries()).map(([region, list]) => (
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
        </fieldset>
      ))}
    </div>
  );
}
