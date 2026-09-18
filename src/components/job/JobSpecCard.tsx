import { gateWidthLabel } from '@/lib/jobParse/access';
import s from './JobSpecCard.module.css';

export type JobSpecPhoto = { url: string; label: string };

export type JobSpec = {
  service: string | null;
  /**
   * The customer's own words for the work. Since the model came out of job
   * creation (8e86e71) `service` is null on almost every submission, so this
   * is in practice the only description a contractor gets.
   */
  serviceVerbatim?: string | null;
  areaValue: number | null;
  areaUnit: string | null;
  areaMapped: number | null;
  urgency: string | null;
  targetDate: string | null;
  accessNotes: string | null;
  obstacles: string | null;
  gateWidth: string | null;
  /** Exact gate location — only ever passed post-award. */
  gateW3w?: string | null;
  conditions?: Record<string, unknown> | null;
  /** District pre-award; callers pass the full postcode only post-award. */
  location: string | null;
  county: string | null;
  distanceMiles?: number | null;
  photos?: JobSpecPhoto[];
};

export const URGENCY_LABELS: Record<string, string> = {
  asap: 'As soon as possible',
  within_month: 'Within the month',
  flexible: 'Flexible',
  dated: 'By a specific date',
};

function areaLabel(spec: JobSpec): string {
  const parts: string[] = [];
  if (spec.areaMapped !== null) parts.push(`${spec.areaMapped} acres measured from a drawn boundary`);
  if (spec.areaValue !== null) {
    const unit = spec.areaUnit === 'linear_m' ? 'metres' : (spec.areaUnit ?? '');
    parts.push(`${spec.areaValue} ${unit} stated by the customer`);
  }
  return parts.join(' · ') || 'Not stated';
}

/**
 * The job specification, rendered identically wherever it appears (contractor
 * price page, client portal, won-job view). Redaction is by omission: what a
 * caller doesn't pass cannot render — pre-award callers simply never receive
 * contact fields or exact locations from their data source.
 */
export function JobSpecCard({ spec }: { spec: JobSpec }) {
  const conditions = Object.entries(spec.conditions ?? {});
  const rows: [string, string | null][] = [
    // The customer's own words first: the classified service name (when there
    // is one) already heads the page, so repeating it here told the contractor
    // nothing, and when there wasn't one this row rendered a placeholder —
    // "Described by the customer" — with the description nowhere on the page.
    ['Work', spec.serviceVerbatim || spec.service || 'Described by the customer'],
    ['Area', areaLabel(spec)],
    [
      'Where',
      [spec.location, spec.county].filter(Boolean).join(', ') +
        (spec.distanceMiles != null ? ` — about ${spec.distanceMiles} miles from your base` : ''),
    ],
    [
      'When',
      spec.urgency
        ? `${URGENCY_LABELS[spec.urgency] ?? spec.urgency}${spec.targetDate ? ` (${spec.targetDate})` : ''}`
        : 'Not stated',
    ],
    ['Gate / entrance', spec.gateWidth ? gateWidthLabel(spec.gateWidth) : null],
    ['Gate location', spec.gateW3w ? `///${spec.gateW3w}` : null],
    ['Access', spec.accessNotes],
    ['In the way', spec.obstacles],
  ];

  return (
    <div className={s.card}>
      <dl className={s.rows}>
        {rows.map(
          ([label, value]) =>
            value && (
              <div key={label} className={s.row}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ),
        )}
        {conditions.length > 0 && (
          <div className={s.row}>
            <dt>Conditions</dt>
            <dd>
              {conditions
                .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v).replace(/_/g, ' ')}`)
                .join(' · ')}
            </dd>
          </div>
        )}
      </dl>
      {spec.photos && spec.photos.length > 0 && (
        <div className={s.photos}>
          {spec.photos.map((p) => (
            <a key={p.url} href={p.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.label} className={s.photo} loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
