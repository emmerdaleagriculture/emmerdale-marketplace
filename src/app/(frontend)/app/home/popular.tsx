/**
 * The six jobs customers most often send, as tiles on the app's home screen.
 * Names match the services list (src/lib/jobParse/services.ts); the tiles
 * all lead into /start, which asks for the job in the customer's own words.
 */
export type TileIcon = 'topping' | 'mowing' | 'harrowing' | 'rolling' | 'muck' | 'seed';

export const POPULAR_SERVICES: { name: string; slug: string; icon: TileIcon }[] = [
  { name: 'Paddock topping', slug: 'topping', icon: 'topping' },
  { name: 'Finish mowing', slug: 'mowing', icon: 'mowing' },
  { name: 'Harrowing', slug: 'harrowing', icon: 'harrowing' },
  { name: 'Rolling', slug: 'rolling', icon: 'rolling' },
  { name: 'Muck sweeping', slug: 'muck-sweeping', icon: 'muck' },
  { name: 'Overseeding', slug: 'overseeding', icon: 'seed' },
];

const P: Record<TileIcon, string> = {
  topping: 'M3 20h18M4 20v-5l3-3 3 3 3-5 3 4 3-2v8',
  mowing: 'M4 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM8 18h6M6 16l2-8h8l2 8M10 8V5h4v3',
  harrowing: 'M5 4v16M9.5 4v16M14.5 4v16M19 4v16M3 9h18',
  rolling: 'M4 15a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm6 0h10M20 11v8',
  muck: 'M6 20h12l-2-9H8l-2 9ZM10 11V8a2 2 0 0 1 4 0v3M4 20h16',
  seed: 'M12 21V11M12 11c0-4 3-7 7-7 0 4-3 7-7 7Zm0 3c0-3-2.5-5-5.5-5 0 3 2.5 5 5.5 5Z',
};

export function ServiceTileIcon({ name }: { name: TileIcon }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
