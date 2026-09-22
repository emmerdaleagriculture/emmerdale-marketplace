import { UK_MAP_VIEWBOX } from '@/lib/ukCountyPaths';
import { coverageMapLabel, coverageShapes } from '@/lib/coverage';

/**
 * Great Britain choropleth: counties shaded by how many approved contractors
 * cover them. Pure server-rendered SVG, used inline by the admin pages; the
 * front page draws the same map through the /coverage-map.svg route instead,
 * because the path data is far too heavy to inline in a landing page.
 */
export function UKCoverageMap({
  counts,
  className,
  pathClassName,
  showCounts = false,
  unit,
  label,
}: {
  counts: Record<string, number>;
  className?: string;
  pathClassName?: string;
  /** Admin only — public pages must not reveal per-county contractor numbers. */
  showCounts?: boolean;
  /** What the numbers are, when they are not contractors. */
  unit?: { one: string; many: string; none: string };
  /** What the map is of, for the aria label. */
  label?: string;
}) {
  return (
    <svg
      viewBox={UK_MAP_VIEWBOX}
      className={className}
      role="img"
      aria-label={coverageMapLabel(counts, label)}
    >
      {coverageShapes(counts, showCounts, unit).map((c) => (
        <path
          key={c.name}
          d={c.d}
          fill={c.fill}
          stroke="#fff"
          strokeWidth={1}
          className={pathClassName}
        >
          <title>{c.title}</title>
        </path>
      ))}
    </svg>
  );
}
