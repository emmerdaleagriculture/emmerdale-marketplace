import s from './TractorLoader.module.css';

/**
 * The loading symbol: a tractor driving on the spot, wheels turning. Size is
 * the width in px (the height follows); `label` is what a screen reader says
 * (null when whatever holds it announces itself).
 */
export function TractorLoader({ size = 72, label = 'Loading' }: { size?: number; label?: string | null }) {
  return (
    <span className={s.wrap} {...(label ? { role: 'status', 'aria-label': label } : {})}>
      <svg className={s.svg} width={size} height={(size * 48) / 72} viewBox="0 0 72 48" aria-hidden="true" focusable="false">
        {/* Ground rushing past */}
        <path className={s.ground} data-tl-move d="M2 46.5h68" />
        <g className={s.body} data-tl-move>
          {/* Exhaust and its puffs */}
          <circle className={s.puff} data-tl-move cx="50" cy="6" r="2" />
          <circle className={`${s.puff} ${s.puff2}`} data-tl-move cx="50" cy="6" r="2" />
          <rect className={s.dark} x="48.6" y="8" width="2.8" height="11" rx="1.2" />
          {/* Cab */}
          <path className={s.green} d="M17 4.5h17.5a2 2 0 0 1 1.95 1.55L39.6 20H17z" />
          <path className={s.glass} d="M20.5 8h12.6l2.3 10H20.5z" />
          <rect className={s.roof} x="14.5" y="2.5" width="23" height="3.4" rx="1.7" />
          {/* Bonnet and chassis */}
          <path className={s.green} d="M13 19h43.5a4 4 0 0 1 4 4v8.5a2 2 0 0 1-2 2H13z" />
          <rect className={s.stripe} x="38" y="23.2" width="19" height="2.4" rx="1.2" />
          <rect className={s.dark} x="58.6" y="22.5" width="1.9" height="8" rx="0.9" />
          {/* Mudguard over the big wheel */}
          <path className={s.guard} d="M5.5 31a14.5 14.5 0 0 1 29 0h-4a10.5 10.5 0 0 0-21 0z" />
        </g>
        {/* Rear wheel */}
        <g className={s.wheel} data-tl-wheel>
          <circle className={s.lugs} cx="20" cy="33" r="11.2" strokeDasharray="3.4 2.464" />
          <circle className={s.tyre} cx="20" cy="33" r="10.4" />
          <circle className={s.hub} cx="20" cy="33" r="5.6" />
          <path className={s.spoke} d="M20 28.4v9.2M15.4 33h9.2" />
          <circle className={s.nut} cx="20" cy="33" r="1.5" />
        </g>
        {/* Front wheel */}
        <g className={`${s.wheel} ${s.front}`} data-tl-wheel>
          <circle className={s.lugs} cx="54" cy="38" r="6.7" strokeDasharray="2.6 2.662" />
          <circle className={s.tyre} cx="54" cy="38" r="6" />
          <circle className={s.hub} cx="54" cy="38" r="3.2" />
          <path className={s.spoke} d="M54 35.4v5.2M51.4 38h5.2" />
          <circle className={s.nut} cx="54" cy="38" r="0.9" />
        </g>
      </svg>
    </span>
  );
}

/** The loader centred in the space a page will fill. */
export function PageLoading({ label }: { label?: string }) {
  return (
    <div className={s.page}>
      <TractorLoader label={label} />
    </div>
  );
}
