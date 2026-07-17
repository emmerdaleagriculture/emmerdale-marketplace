import styles from './TimeSeriesChart.module.css';

type Point = { date: string; clicks: number; impressions: number };

/**
 * Hand-rolled SVG chart of daily clicks (left axis) + impressions (right axis).
 * No dependencies — just SVG primitives. Ported from the HPM admin.
 */
export function TimeSeriesChart({ data }: { data: Point[] }) {
  if (data.length === 0) return <p className={styles.empty}>No data.</p>;

  const W = 1000;
  const H = 280;
  const PADDING = { top: 20, right: 50, bottom: 40, left: 50 };
  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;

  const maxClicks = Math.max(1, ...data.map((d) => d.clicks));
  const maxImpr = Math.max(1, ...data.map((d) => d.impressions));

  const x = (i: number) =>
    PADDING.left + (data.length === 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const yClicks = (v: number) => PADDING.top + innerH - (v / maxClicks) * innerH;
  const yImpr = (v: number) => PADDING.top + innerH - (v / maxImpr) * innerH;

  const clicksPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${yClicks(d.clicks).toFixed(1)}`)
    .join(' ');
  const imprPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${yImpr(d.impressions).toFixed(1)}`)
    .join(' ');

  const tickIndices = Array.from({ length: 6 }, (_, i) =>
    Math.round((i * (data.length - 1)) / 5),
  ).filter((v, i, arr) => arr.indexOf(v) === i);

  const clicksTicks = [0, maxClicks / 2, maxClicks];
  const imprTicks = [0, maxImpr / 2, maxImpr];

  const fmt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });

  return (
    <figure className={styles.chartWrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.chart}
        role="img"
        aria-label="Daily clicks and impressions over time"
      >
        {clicksTicks.map((v, i) => (
          <line
            key={i}
            x1={PADDING.left}
            x2={W - PADDING.right}
            y1={yClicks(v)}
            y2={yClicks(v)}
            className={styles.gridLine}
          />
        ))}

        <path d={imprPath} className={styles.imprLine} fill="none" />
        <path d={clicksPath} className={styles.clicksLine} fill="none" />

        {tickIndices.map((idx) => {
          const d = data[idx];
          if (!d) return null;
          const date = new Date(d.date);
          const label = `${date.getUTCDate()} ${date.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
          return (
            <text
              key={idx}
              x={x(idx)}
              y={H - PADDING.bottom + 18}
              className={styles.axisLabel}
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}

        {clicksTicks.map((v, i) => (
          <text
            key={i}
            x={PADDING.left - 8}
            y={yClicks(v) + 4}
            className={`${styles.axisLabel} ${styles.clicksLabel}`}
            textAnchor="end"
          >
            {fmt(v)}
          </text>
        ))}

        {imprTicks.map((v, i) => (
          <text
            key={i}
            x={W - PADDING.right + 8}
            y={yImpr(v) + 4}
            className={`${styles.axisLabel} ${styles.imprLabel}`}
            textAnchor="start"
          >
            {fmt(v)}
          </text>
        ))}
      </svg>

      <figcaption className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.clicksSwatch}`} aria-hidden />
          Clicks (left axis)
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.imprSwatch}`} aria-hidden />
          Impressions (right axis)
        </span>
      </figcaption>
    </figure>
  );
}
