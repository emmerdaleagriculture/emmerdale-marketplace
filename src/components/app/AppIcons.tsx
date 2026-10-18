import type { TabIcon } from './tabs';

const P = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.8V20h13V9.8M10 20v-6h4v6',
  jobs: 'M4 8h16v12H4zM9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M4 13h16',
  messages: 'M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.1-2.9-.4L5 20l1.1-3.2C4.8 15.6 4 14.1 4 12.5 4 8.9 7.6 6 12 6s8 2.9 8 6.5Z',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6',
  board: 'M4 8h16v12H4zM9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M4 13h16',
  diary: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  earnings: 'M15 5.5A3.5 3.5 0 0 0 8 6v5m0 0v3c0 2-1 3.5-2.5 5H18M5.5 11H13',
} as const;

/** The tab bar's line icons: one path each, drawn in the current colour. */
export function TabIconSvg({ name }: { name: TabIcon }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function BackChevron() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
