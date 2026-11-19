import type { ReactNode } from 'react';
import s from './books.module.css';

/**
 * Line icons for Books (Lucide/Feather shapes, one path each, drawn in the
 * current colour) and the figure tile used on the overview and tax pages.
 */
const PATHS = {
  ledger: 'M12 3v18M7 21h10M4 7h16M12 3v4M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z',
  pnl: 'M5 20v-6M12 20V9M19 20V4M3 20h18',
  vat: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  tax: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 17l6-6M9.5 11.5h.01M14.5 16.5h.01',
  journal: 'M5 3h11a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zM9 8h5M9 12h5M9 16h3',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  bank: 'M3 21h18M5 18v-7M9.5 18v-7M14.5 18v-7M19 18v-7M12 3l9 5H3z',
  coins: 'M8 13c3.3 0 6-1.3 6-3S11.3 7 8 7s-6 1.3-6 3 2.7 3 6 3zM2 10v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4M10 7.2C10.6 5.4 13.1 4 16 4c3.3 0 6 1.3 6 3s-2.4 2.9-5.5 3M22 7v4c0 1.6-2.3 2.8-5.4 3',
  expenses: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  trend: 'M22 7l-8.5 8.5-5-5L2 17M16 7h6v6',
  plus: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v8M8 12h8',
  minus: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  invoice: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  car: 'M3 17v-5l2.2-5.2A2 2 0 0 1 7 5.5h10a2 2 0 0 1 1.8 1.3L21 12v5M3 12h18M3 17h18M6 17v2M18 17v2M7 14.5h.01M17 14.5h.01',
  arrow: 'M5 12h14M12 5l7 7-7 7',
} as const;

export type BooksIconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: BooksIconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export type TileTone = 'teal' | 'green' | 'amber' | 'red';

/** A figure: icon and label, the amount, a hint, and a coloured curve in the corner. */
export function Tile({ icon, label, value, hint, tone }: { icon: BooksIconName; label: string; value: string; hint?: ReactNode; tone: TileTone }) {
  return (
    <div className={s.tile} data-tone={tone}>
      <div className={s.tileHead}>
        <span className={s.tileIcon}>
          <Icon name={icon} size={20} />
        </span>
        <span className={s.tileLabel}>{label}</span>
      </div>
      <div className={s.tileValue}>{value}</div>
      {hint && <div className={s.tileHint}>{hint}</div>}
      <svg className={s.tileWave} viewBox="0 0 160 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 58 C 60 58, 95 40, 160 6" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M0 58 C 60 58, 95 40, 160 6 L160 60 L0 60 Z" fill="currentColor" opacity="0.12" />
      </svg>
    </div>
  );
}

/** Rows fanning out from the vanishing point under the sun. */
const ROWS = Array.from({ length: 26 }, (_, i) => -260 + i * 40);

/**
 * The header's landscape: dusk sky, a low sun, a treeline and crop rows
 * running to the horizon. Drawn, so it costs nothing to load and scales to
 * any width (it crops from the middle).
 */
export function HeroArt() {
  return (
    <svg className={s.heroArt} viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="booksSun" cx="330" cy="92" r="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe3a0" stopOpacity="0.95" />
          <stop offset="0.12" stopColor="#ffc56a" stopOpacity="0.75" />
          <stop offset="0.45" stopColor="#e2953c" stopOpacity="0.22" />
          <stop offset="1" stopColor="#e2953c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="booksField" x1="0" y1="92" x2="0" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2d5a1f" />
          <stop offset="1" stopColor="#5f9a35" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="400" height="150" fill="url(#booksSun)" />
      <path
        d="M0 93 L0 88 C8 84 14 85 20 87 C26 82 34 82 40 86 C52 88 64 87 76 89 C84 84 92 83 100 87 C120 89 150 88 175 90 C182 85 190 84 198 88 C230 90 262 88 290 90 C298 86 304 86 310 89 L400 90 L400 93 Z"
        fill="#071209"
      />
      <path d="M0 93 L400 93 L400 150 L0 150 Z" fill="url(#booksField)" />
      <g stroke="#b8e58a" strokeOpacity="0.32" strokeWidth="1.1">
        {ROWS.map((x) => (
          <line key={x} x1="330" y1="93" x2={x * 1.6 + 200} y2="150" />
        ))}
      </g>
      <rect x="0" y="0" width="400" height="150" fill="url(#booksSun)" opacity="0.35" />
    </svg>
  );
}
