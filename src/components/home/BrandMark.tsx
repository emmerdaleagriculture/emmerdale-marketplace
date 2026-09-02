/**
 * EA monogram — a field-boundary square with an angular E and A cut into it.
 * Draws in `currentColor` so it takes the colour of whatever it sits in.
 */
export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
    >
      <rect x="1.5" y="1.5" width="37" height="37" rx="6" stroke="currentColor" strokeWidth="2.2" />
      <path d="M9 10 H21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
      <path d="M9 10 V30" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
      <path d="M9 19.6 H18.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
      <path d="M9 30 H21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
      <path
        d="M23 30 L28 12 L33 30"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <path d="M24.6 24.4 H31.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}
