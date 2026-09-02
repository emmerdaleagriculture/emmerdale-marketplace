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
  | 'tractor_hire';

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
