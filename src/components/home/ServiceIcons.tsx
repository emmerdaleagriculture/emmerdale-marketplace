import type { ReactNode } from 'react';

export type ServiceIconKey =
  | 'topping'
  | 'mowing'
  | 'harrowing'
  | 'rolling'
  | 'muck_sweeping'
  | 'overseeding'
  | 'hedge'
  | 'clearance'
  | 'spraying'
  | 'fertiliser'
  | 'rotavating'
  | 'mole'
  | 'fencing'
  | 'tractor_hire'
  | 'flail_collect'
  | 'lime'
  | 'tree'
  | 'subsoil'
  | 'scarify'
  | 'stones'
  | 'tractor'
  | 'trailer'
  | 'grader'
  | 'mulcher'
  | 'excavator'
  | 'road'
  | 'mounds';

// Line-art glyphs for the service cards. All share one 40×40 frame and stroke
// so the grid reads as a set.
const PATHS: Record<ServiceIconKey, ReactNode> = {
  topping: (
    <>
      <path d="M4 30 L12 22 L20 30 L28 22 L36 30" />
      <path d="M4 34 H36" />
      <path d="M10 18 V13" />
      <path d="M22 18 V11" />
      <path d="M32 18 V14" />
    </>
  ),
  mowing: (
    <>
      <rect x="6" y="16" width="22" height="10" rx="2" />
      <circle cx="12" cy="30" r="3" />
      <circle cx="26" cy="30" r="3" />
      <path d="M28 20 L34 14" />
      <path d="M31 12 h6 v4 h-6z" />
    </>
  ),
  harrowing: (
    <>
      <path d="M6 14 H34" />
      <path d="M6 20 H34" />
      <path d="M10 14 V26" />
      <path d="M16 14 V28" />
      <path d="M22 14 V26" />
      <path d="M28 14 V28" />
      <path d="M8 30 L32 30" />
    </>
  ),
  rolling: (
    <>
      <circle cx="20" cy="22" r="8" />
      <path d="M12 22 H28" />
      <path d="M8 32 H32" />
      <path d="M20 10 V6" />
    </>
  ),
  muck_sweeping: (
    <>
      <path d="M8 32 L14 20 L22 20 L28 32" />
      <path d="M14 20 L14 12" />
      <path d="M22 20 L22 10" />
      <path d="M11 26 H25" />
      <path d="M6 34 H34" />
    </>
  ),
  overseeding: (
    <>
      <path d="M20 6 C24 12 24 18 20 22 C16 18 16 12 20 6z" />
      <path d="M20 22 V34" />
      <circle cx="10" cy="30" r="1.4" />
      <circle cx="14" cy="34" r="1.4" />
      <circle cx="26" cy="34" r="1.4" />
      <circle cx="30" cy="30" r="1.4" />
    </>
  ),
  hedge: (
    <>
      <path d="M6 32 C10 26 12 18 12 10" />
      <path d="M12 10 C16 14 16 22 12 28" />
      <path d="M20 32 C24 26 26 18 26 10" />
      <path d="M26 10 C30 14 30 22 26 28" />
      <path d="M4 34 H36" />
    </>
  ),
  clearance: (
    <>
      <path d="M6 30 L16 30 L22 14 L34 14" />
      <path d="M22 30 H34" />
      <path d="M6 34 H36" />
    </>
  ),
  spraying: (
    <>
      <path d="M12 30 V16 a8 8 0 0 1 16 0 v14" />
      <path d="M12 22 h16" />
      <path d="M20 8 V4" />
      <path d="M8 34 h24" />
    </>
  ),
  fertiliser: (
    <>
      <circle cx="20" cy="14" r="6" />
      <path d="M20 20 V30" />
      <path d="M14 26 L20 30 L26 26" />
      <path d="M6 34 H34" />
    </>
  ),
  rotavating: (
    <>
      <circle cx="20" cy="20" r="9" />
      <path d="M20 11 V6" />
      <path d="M20 34 V29" />
      <path d="M11 20 H6" />
      <path d="M34 20 H29" />
    </>
  ),
  mole: (
    <>
      <path d="M8 30 L20 12 L32 30" />
      <path d="M14 30 L20 22 L26 30" />
      <path d="M6 34 H34" />
    </>
  ),
  fencing: (
    <>
      <path d="M8 34 V16" />
      <path d="M20 34 V16" />
      <path d="M32 34 V16" />
      <path d="M6 20 H34" />
      <path d="M6 28 H34" />
    </>
  ),
  tractor_hire: (
    <>
      <rect x="6" y="18" width="20" height="10" rx="2" />
      <circle cx="12" cy="32" r="3" />
      <circle cx="22" cy="32" r="3" />
      <path d="M26 22 H34 L30 14 H20" />
    </>
  ),
  // Flail with a collecting hopper behind it.
  flail_collect: (
    <>
      <rect x="4" y="22" width="14" height="8" rx="2" />
      <path d="M6 30 L8 34 M11 30 L13 34 M16 30 L18 34" />
      <path d="M18 26 H22" />
      <path d="M22 14 H36 V30 H22 Z" />
      <path d="M22 20 H36" />
    </>
  ),
  // Spreader throwing a fan of lime.
  lime: (
    <>
      <path d="M10 10 H26 L22 22 H14 Z" />
      <path d="M18 22 V26" />
      <path d="M18 28 L8 34 M18 28 L18 35 M18 28 L28 34" />
      <path d="M31 18 h.01 M34 24 h.01 M4 22 h.01" />
    </>
  ),
  // A tree and a felled log.
  tree: (
    <>
      <path d="M14 6 L22 20 H18 L24 30 H4 L10 20 H6 Z" />
      <path d="M14 30 V35" />
      <rect x="24" y="28" width="12" height="6" rx="3" />
      <circle cx="33" cy="31" r="1.5" />
    </>
  ),
  // A subsoiler leg reaching down through the soil layers.
  subsoil: (
    <>
      <path d="M4 14 H36" />
      <path d="M4 24 H36" strokeDasharray="2 3" />
      <path d="M20 6 V28 L26 32" />
      <path d="M14 6 H26" />
    </>
  ),
  // Scarifier tines raking up thatch.
  scarify: (
    <>
      <path d="M6 12 H34" />
      <path d="M9 12 L7 24 M15 12 L13 24 M21 12 L19 24 M27 12 L25 24 M33 12 L31 24" />
      <path d="M4 30 C 10 26, 14 34, 20 30 S 30 26, 36 30" />
    </>
  ),
  // A tractor, big back wheel and small front.
  tractor: (
    <>
      <circle cx="12" cy="27" r="7" />
      <circle cx="30" cy="30" r="4" />
      <path d="M12 20 V10 H22 L26 20 H34 V26" />
      <path d="M19 27 H26" />
    </>
  ),
  // A two-axle trailer with a load.
  trailer: (
    <>
      <path d="M6 16 H30 V26 H6 Z" />
      <circle cx="13" cy="30" r="3" />
      <circle cx="23" cy="30" r="3" />
      <path d="M30 22 H36" />
      <path d="M9 16 L13 11 L18 16 M18 16 L23 12 L27 16" />
    </>
  ),
  // A grader blade levelling a track.
  grader: (
    <>
      <path d="M4 32 C 12 28, 16 34, 22 31 L36 31" />
      <path d="M14 26 L26 20" />
      <path d="M20 23 V12 H30" />
      <circle cx="32" cy="24" r="3" />
    </>
  ),
  // A mulcher head with fixed teeth.
  mulcher: (
    <>
      <rect x="6" y="14" width="22" height="12" rx="3" />
      <path d="M9 26 L9 30 M14 26 L14 30 M19 26 L19 30 M24 26 L24 30" />
      <path d="M28 20 H36" />
      <path d="M5 34 L12 32 L18 35 L25 32 L33 34" />
    </>
  ),
  // An excavator arm and bucket.
  excavator: (
    <>
      <rect x="4" y="24" width="16" height="6" rx="3" />
      <path d="M8 24 V18 H16 V24" />
      <path d="M16 19 L26 9 L32 18" />
      <path d="M32 18 L36 20 L33 25 L29 22 Z" />
    </>
  ),
  // A road running into the distance, centre line dashed.
  road: (
    <>
      <path d="M14 6 L4 34" />
      <path d="M26 6 L36 34" />
      <path d="M20 8 V12 M20 17 V22 M20 27 V33" />
    </>
  ),
  // Planting mounds in a row, a sapling on one.
  mounds: (
    <>
      <path d="M4 32 C 8 24, 12 24, 16 32" />
      <path d="M16 32 C 20 24, 24 24, 28 32" />
      <path d="M28 32 C 31 26, 34 26, 36 32" />
      <path d="M22 26 V18 M22 21 L19 18 M22 20 L25 17" />
    </>
  ),
  // Stones going under a buried layer.
  stones: (
    <>
      <path d="M4 16 H36" />
      <ellipse cx="11" cy="26" rx="4" ry="3" />
      <ellipse cx="22" cy="29" rx="5" ry="3.5" />
      <ellipse cx="31" cy="24" rx="3.5" ry="2.5" />
      <path d="M20 6 V12 M17 9 L20 12 L23 9" />
    </>
  ),
};

export function ServiceIcon({ icon, size = 40 }: { icon: ServiceIconKey; size?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[icon]}
    </svg>
  );
}
