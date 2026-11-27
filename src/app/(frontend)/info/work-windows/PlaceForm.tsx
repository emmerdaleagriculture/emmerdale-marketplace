'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeApp } from '@/lib/app/isApp';
import css from './windows.module.css';

/**
 * Where to forecast for: a postcode (or its first half), or the phone's own
 * position. The last place used is kept on the device, so opening the page
 * again asks nothing.
 */
const KEY = 'ea_info_place';

async function position(): Promise<string | null> {
  try {
    if (isNativeApp()) {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.requestPermissions();
      if (perm.location === 'denied') return null;
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
      return `${pos.coords.latitude.toFixed(2)},${pos.coords.longitude.toFixed(2)}`;
    }
    const pos = await new Promise<GeolocationPosition>((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }),
    );
    return `${pos.coords.latitude.toFixed(2)},${pos.coords.longitude.toFixed(2)}`;
  } catch {
    return null;
  }
}

export function PlaceForm({ at, job, shown }: { at: string; job: string; shown: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(/^-?\d/.test(at) ? '' : at);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (place: string) => router.push(`/info/work-windows?at=${encodeURIComponent(place)}&job=${job}`);

  // A place that produced a forecast is remembered; with none asked for, the
  // remembered one is used at once.
  useEffect(() => {
    try {
      if (at && shown) localStorage.setItem(KEY, at);
      else if (!at) {
        const last = localStorage.getItem(KEY);
        if (last) router.replace(`/info/work-windows?at=${encodeURIComponent(last)}&job=${job}`);
      }
    } catch {}
  }, [at, shown, job, router]);

  return (
    <form
      className={css.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) go(value.trim());
      }}
    >
      <label className={css.label} htmlFor="info-place">
        Postcode, or just the first half
      </label>
      <div className={css.formRow}>
        <input
          id="info-place"
          className={css.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="SO51"
          autoComplete="postal-code"
          autoCapitalize="characters"
          enterKeyHint="go"
        />
        <button type="submit" className={css.btn}>
          Show
        </button>
      </div>
      <button
        type="button"
        className={css.locate}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const p = await position();
          setBusy(false);
          if (p) go(p);
          else setError('Couldn’t get your position. Type a postcode instead.');
        }}
      >
        {busy ? 'Finding you…' : 'Use where I am'}
      </button>
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
