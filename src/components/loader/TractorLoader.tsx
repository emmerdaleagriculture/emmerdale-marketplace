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
          {/* Rear linkage, behind the big wheel */}
          <path className={s.arm} d="M10 34 3.6 37.6" />
          <circle className={s.dark} cx="3.4" cy="37.7" r="1.2" />
          {/* Exhaust with its rain flap, the air intake, and the puffs */}
          <circle className={s.puff} data-tl-move cx="50" cy="5.5" r="2" />
          <circle className={`${s.puff} ${s.puff2}`} data-tl-move cx="50" cy="5.5" r="2" />
          <rect className={s.dark} x="48.7" y="8.6" width="2.4" height="10.6" rx="1" />
          <path className={s.arm} d="M48.4 8.4 52 7.2" />
          <rect className={s.dark} x="43.6" y="14.6" width="1.8" height="4.6" rx="0.6" />
          <rect className={s.dark} x="42.9" y="13" width="3.2" height="2.2" rx="1.1" />
          {/* Cab: frame, glass, seat and steering wheel, door pillar, roof and beacon */}
          <path className={s.green} d="M17 4.5h17.5a2 2 0 0 1 1.95 1.55L39.6 20H17z" />
          <path className={s.glass} d="M20.2 7.8h12.9l2.4 10.4H20.2z" />
          <path className={s.shine} d="M21.6 9.2h3.2l-3.2 5.4z" />
          <path className={s.dark} d="M22 18.2v-5.4a1 1 0 0 1 1-1h.9a1 1 0 0 1 1 1v3.3h2.3a1 1 0 0 1 1 1v1.1z" />
          <path className={s.arm} d="M33.6 18.2 31.9 13.6M30.3 14.3l3.1-1.3" />
          <path className={s.pillar} d="M28.6 7.8v10.4" />
          <rect className={s.roof} x="14.5" y="2.5" width="23" height="3.4" rx="1.7" />
          <rect className={s.light} x="16.4" y="3.1" width="19.2" height="0.8" rx="0.4" />
          <rect className={s.amber} x="18.4" y="0.6" width="3.2" height="2.2" rx="1" />
          {/* Bonnet: highlight, stripe, vents, grille and headlight */}
          <path className={s.green} d="M13 19h43.5a4 4 0 0 1 4 4v8.5a2 2 0 0 1-2 2H13z" />
          <path className={s.light} d="M37.5 19h19a4 4 0 0 1 3.3 1.7H37.5z" />
          <rect className={s.stripe} x="38" y="23.2" width="17.4" height="2.2" rx="1.1" />
          <path className={s.vent} d="M41 28.2h4.4M41 30h4.4M47.6 28.2H52M47.6 30H52" />
          <rect className={s.dark} x="57" y="23.6" width="3.5" height="8.2" rx="0.9" />
          <path className={s.grille} d="M57.6 25.6h2.3M57.6 27.6h2.3M57.6 29.6h2.3" />
          <circle className={s.lamp} cx="58.7" cy="21.9" r="1.05" />
          {/* Engine underside, front weight, front axle and the cab step */}
          <path className={s.roof} d="M31 31.2h26.8v1.6a1.6 1.6 0 0 1-1.6 1.6H31z" />
          <rect className={s.dark} x="60.4" y="27.2" width="2.6" height="5.4" rx="0.7" />
          <path className={s.dark} d="M51.6 34h4.8l-.9 4.6h-3z" />
          <path className={s.arm} d="M36.4 34.2v4M40.2 34.2v4M35.4 38.4h5.8" />
          {/* Mudguard over the big wheel, with its tail light */}
          <path className={s.guard} d="M5.5 31a14.5 14.5 0 0 1 29 0h-4a10.5 10.5 0 0 0-21 0z" />
          <path className={s.guardShine} d="M9.2 22.6A14 14 0 0 1 30.8 22.6" />
          <rect className={s.red} x="5.4" y="27.4" width="1.5" height="2.6" rx="0.6" />
        </g>
        {/* Rear wheel: treads, tyre, sidewall, rim, dish, nuts and cap */}
        <g className={s.wheel} data-tl-wheel>
          <circle className={s.lugs} cx="20" cy="33" r="11.2" strokeDasharray="3.4 2.464" />
          <circle className={s.tyre} cx="20" cy="33" r="10.4" />
          <circle className={s.wall} cx="20" cy="33" r="8.5" />
          <circle className={s.hub} cx="20" cy="33" r="6" />
          <circle className={s.dish} cx="20" cy="33" r="4.5" />
          <circle className={s.hub} cx="20" cy="33" r="2" />
          <path className={s.nuts} d="M23.1 33h.01M20.96 35.95h.01M17.49 34.82h.01M17.49 31.18h.01M20.96 30.05h.01" />
          <circle className={s.nut} cx="20" cy="33" r="0.8" />
        </g>
        {/* Front wheel */}
        <g className={`${s.wheel} ${s.front}`} data-tl-wheel>
          <circle className={s.lugs} cx="54" cy="38" r="6.7" strokeDasharray="2.6 2.662" />
          <circle className={s.tyre} cx="54" cy="38" r="6" />
          <circle className={s.wall} cx="54" cy="38" r="4.8" />
          <circle className={s.hub} cx="54" cy="38" r="3.4" />
          <circle className={s.dish} cx="54" cy="38" r="2.4" />
          <path className={s.nuts} d="M55.6 38h.01M54 39.6h.01M52.4 38h.01M54 36.4h.01" />
          <circle className={s.nut} cx="54" cy="38" r="0.6" />
        </g>
      </svg>
    </span>
  );
}

/** The loader centred in the space a page will fill. */
export function PageLoading({ label }: { label?: string }) {
  return (
    <div className={s.page}>
      <TractorLoader size={132} label={label} />
    </div>
  );
}
