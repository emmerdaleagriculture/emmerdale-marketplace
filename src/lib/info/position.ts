import { isNativeApp } from '@/lib/app/isApp';

/**
 * Following the device's position, for the Info maps. In the app it goes
 * through the Capacitor plugin (iOS Core Location / Android fused location);
 * on the website, through the browser. Either way a GPS receiver plugged into
 * an iPhone (Bad Elf, Garmin GLO, Dual XGPS) feeds the same position, so the
 * maps get its better fix without knowing it is there: the accuracy figure
 * is how to tell.
 */

export type Fix = { lat: number; lng: number; accuracy: number; /** ms since 1970 */ at: number };

/** Start following the position; returns the function that stops it. */
export async function watchPosition(onFix: (f: Fix) => void, onFail: () => void): Promise<() => void> {
  if (isNativeApp()) {
    // Destructured from the module namespace: a Capacitor plugin proxy must
    // never be returned from an async function (it looks like a thenable).
    const { Geolocation } = await import('@capacitor/geolocation');
    const perm = await Geolocation.requestPermissions().catch(() => null);
    if (!perm || perm.location === 'denied') {
      onFail();
      return () => {};
    }
    const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }, (pos, err) => {
      if (err || !pos) return;
      onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp || Date.now() });
    });
    return () => void Geolocation.clearWatch({ id });
  }
  if (!('geolocation' in navigator)) {
    onFail();
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp || Date.now() }),
    (err) => {
      if (err.code === err.PERMISSION_DENIED) onFail();
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** One position, for "Where I am". */
export function onePosition(): Promise<Fix | null> {
  return new Promise((resolve) => {
    let stop: (() => void) | null = null;
    let done = false;
    const finish = (f: Fix | null) => {
      if (done) return;
      done = true;
      stop?.();
      resolve(f);
    };
    setTimeout(() => finish(null), 15000);
    watchPosition(
      (f) => finish(f),
      () => finish(null),
    ).then((s) => {
      stop = s;
      if (done) s();
    });
  });
}
