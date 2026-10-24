import { resolveAnomaly } from './actions';
import { ruleLabel } from '@/lib/security/probe';
import s from '../admin.module.css';
import f from '@/components/forms/forms.module.css';

/**
 * Every finding that is not a scan: the detector gone quiet, a span it could
 * not score, a Layer 0 audit result. The message carries the remedy; the
 * card carries the message.
 */
export function AnomalyCard({
  id,
  rule,
  severity,
  message,
  detectedAt,
  updatedAt,
  recentCount,
  resolvedAt,
  resolution,
}: {
  id: number;
  rule: string;
  severity: string;
  message: string;
  detectedAt: string;
  updatedAt: string;
  recentCount: number;
  resolvedAt?: string | null;
  resolution?: string | null;
}) {
  const resolved = Boolean(resolvedAt);
  const tone = severity === 'critical' ? s.cardCritical : severity === 'warning' ? s.cardWarning : '';
  const sev = severity === 'critical' ? s.sevCritical : severity === 'warning' ? s.sevWarning : s.sevInfo;
  return (
    <div className={`${s.card} ${resolved ? s.cardResolved : tone}`}>
      <div className={s.cardHead}>
        <span className={s.cardTitle}>{ruleLabel(rule)}</span>
        <span className={`${s.pill} ${sev}`}>{severity}</span>
        <span className={s.cardMeta}>
          {fmt(detectedAt)}
          {recentCount > 1 ? ` · seen ${recentCount} times, last ${fmt(updatedAt)}` : ''}
          {resolvedAt ? ` · closed ${fmt(resolvedAt)}${resolution ? `: ${resolution}` : ''}` : ''}
        </span>
      </div>
      <div className={s.cardBody}>{message}</div>
      {!resolved && (
        <div className={s.cardActions}>
          <form action={resolveAnomaly} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="hidden" name="id" value={id} />
            <input className={f.input} name="resolution" placeholder="Resolution note" style={{ padding: '4px 8px', fontSize: 12, width: 220 }} />
            <button type="submit" className={f.btnGhost} style={{ padding: '4px 10px', fontSize: 11 }}>
              Close
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
