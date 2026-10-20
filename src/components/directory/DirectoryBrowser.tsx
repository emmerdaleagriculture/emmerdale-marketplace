'use client';

import { useState } from 'react';
import { DirectoryCard } from './DirectoryCard';
import type { DirectoryEntry } from '@/lib/reference';
import s from './directory.module.css';

/** One listed member with everywhere they are listed. */
export type DirectoryMember = {
  entry: DirectoryEntry;
  serviceNames: string[];
  counties: string[];
};

/**
 * The directory page's body: a row of county chips and the members who
 * cover the chosen county, or everyone. Client-side for the chips alone —
 * the members are already loaded, so a filter is a local array filter.
 */
export function DirectoryBrowser({ members, counties }: { members: DirectoryMember[]; counties: string[] }) {
  const [active, setActive] = useState<string | null>(null);
  const shown = active ? members.filter((m) => m.counties.includes(active)) : members;

  return (
    <>
      {counties.length > 1 && (
        <div className={s.chips} role="group" aria-label="Filter by county">
          <button
            type="button"
            onClick={() => setActive(null)}
            aria-pressed={active === null}
            className={`${s.chip} ${active === null ? s.chipOn : ''}`}
          >
            Everywhere
          </button>
          {counties.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActive(c)}
              aria-pressed={active === c}
              className={`${s.chip} ${active === c ? s.chipOn : ''}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <p className={s.count} aria-live="polite">
        {shown.length} {shown.length === 1 ? 'contractor' : 'contractors'}
        {active ? ` covering ${active}` : ''}
      </p>
      <div className={s.list}>
        {shown.map((m) => (
          <DirectoryCard
            key={m.entry.contractorId}
            entry={m.entry}
            serviceNames={m.serviceNames}
            county={active ?? undefined}
            counties={m.counties}
          />
        ))}
      </div>
    </>
  );
}
