'use client';

import { useEffect, useRef, useState } from 'react';
import { replay, trackBounds, type Track } from '@/lib/info/coverage';
import { coverageLayer, makeMap, MAPBOX_TOKEN } from './mapLayer';
import css from './coverage.module.css';

/** A saved run, painted from its stored track. Read only. */
export function RunMap({ track, widthM }: { track: Track; widthM: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!MAPBOX_TOKEN);

  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    let cancelled = false;
    let remove: (() => void) | null = null;
    const b = trackBounds(track);
    (async () => {
      const centre = b
        ? {
            lat: (b[0][1] + b[1][1]) / 2,
            lng: (b[0][0] + b[1][0]) / 2,
            zoom: 17,
          }
        : { lat: 54.4, lng: -2.6, zoom: 6 };
      const made = await makeMap(
        ref.current!,
        centre,
        () => !cancelled && setFailed(true),
        () => !cancelled,
      );
      if (made === 'gone') return;
      if (!made) {
        setFailed(true);
        return;
      }
      const { L, map } = made;
      remove = () => map.remove();
      if (b)
        map.fitBounds(
          [
            [b[0][1], b[0][0]],
            [b[1][1], b[1][0]],
          ],
          { padding: [24, 24], maxZoom: 19 },
        );
      const grid = replay(track, widthM);
      if (grid) coverageLayer(L, map, css.coverTile).sync(grid);
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [track, widthM]);

  if (failed) return <p className={css.unavailable}>The map won’t load just now. Check your signal and open this page again.</p>;
  return <div ref={ref} className={css.map} />;
}
