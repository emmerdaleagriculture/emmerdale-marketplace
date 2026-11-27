import type { InfoIcon } from '@/lib/info/topics';

/** Line icons for the Info hub (Lucide shapes, one path each). */
const P: Record<InfoIcon, string> = {
  // cloud-sun
  window: 'M12 2v2M4.9 4.9l1.4 1.4M20 12h2M19.1 4.9l-1.4 1.4M15.9 12.6A4 4 0 1 0 10 9.2M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z',
  calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  // leaf
  weed: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12',
  // droplets
  rates: 'M7 16.3c2.2 0 4-1.8 4-4.1 0-1.1-.6-2.2-1.7-3.1S7.3 7 7 5.5c-.3 1.5-1.200 2.800-2.300 3.700S3 11.100 3 12.250c0 2.200 1.800 4.050 4 4.050zM12.6 6.600A11 11 0 0 0 14 3c.5 2.500 2 4.900 4 6.500s3 3.500 3 5.500a6.980 6.980 0 0 1-11.9 5',
  // notebook-pen
  diary: 'M5 3h11a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zM9 8h5M9 12h5M9 16h3',
  // sprout
  fertiliser: 'M7 20h10M10 20c5.500-2.500.800-6.400 3-10M9.500 9.400c1.100.800 1.800 2.200 2.300 3.700-2 .400-3.500.400-4.800-.300-1.200-.600-2.300-1.900-3-4.200 2.800-.500 4.400 0 5.500.800zM14.100 6a7 7 0 0 0-1.100 4c1.900-.100 3.300-.600 4.300-1.400 1-1 1.600-2.300 1.700-4.600-2.700.100-4 1-4.900 2z',
  // map: three folded panels
  map: 'M9 3 3 5.5v15L9 18l6 3 6-2.500v-15L15 6 9 3zM9 3v15M15 6v15',
  // wheat-ish: a stem with paired leaves
  seed: 'M12 22V8M12 8c0-3 2-5 5-5 0 3-2 5-5 5zM12 8C12 5 10 3 7 3c0 3 2 5 5 5zM12 15c0-3 2-5 5-5 0 3-2 5-5 5zM12 15c0-3-2-5-5-5 0 3 2 5 5 5z',
};

export function InfoIconSvg({ name, size = 24 }: { name: InfoIcon; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
