'use client';

import { useState } from 'react';
import { ACRES_PER_HA, fig, toHa } from '@/lib/info/sprayMaths';
import { useAcresParam } from '@/lib/info/useAcresParam';
import c from '../calc.module.css';

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : NaN;
};

/** Seed for a field: rate times area, and the bags that is. `presets` are kg per acre. */
export function SeedCalculator({ presets }: { presets: { label: string; kgAcre: number }[] }) {
  const [rate, setRate] = useState(presets[0] ? String(presets[0].kgAcre) : '');
  const [rateUnit, setRateUnit] = useState<'acre' | 'ha'>('acre');
  const [area, setArea] = useState('');
  const [areaUnit, setAreaUnit] = useState<'acre' | 'ha'>('acre');
  useAcresParam((a) => {
    setArea(a);
    setAreaUnit('acre');
  });
  const [bag, setBag] = useState('20');

  const kgHa = rateUnit === 'ha' ? num(rate) : num(rate) * ACRES_PER_HA;
  const ha = toHa(num(area), areaUnit);
  const kg = kgHa > 0 && ha > 0 ? kgHa * ha : null;
  const bags = kg && num(bag) > 0 ? kg / num(bag) : null;

  return (
    <section className={c.calc}>
      <h2 className={c.calcTitle}>Seed for the field</h2>
      <p className={c.calcLede}>Pick a job for its usual rate, or type the rate on the bag.</p>
      <div className={c.fields}>
        <label className={c.field}>
          <span>Job</span>
          <span className={c.inputRow}>
            <select
              style={{ flex: 1, borderLeft: 0 }}
              defaultValue="0"
              onChange={(e) => {
                const p = presets[Number(e.target.value)];
                if (p) {
                  setRate(String(p.kgAcre));
                  setRateUnit('acre');
                }
              }}
            >
              {presets.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className={c.field}>
          <span>Seed rate</span>
          <span className={c.inputRow}>
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            <select aria-label="Rate unit" value={rateUnit} onChange={(e) => setRateUnit(e.target.value as 'acre' | 'ha')}>
              <option value="acre">kg/acre</option>
              <option value="ha">kg/ha</option>
            </select>
          </span>
        </label>
        <label className={c.field}>
          <span>Area</span>
          <span className={c.inputRow}>
            <input inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
            <select aria-label="Area unit" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as 'acre' | 'ha')}>
              <option value="acre">acres</option>
              <option value="ha">ha</option>
            </select>
          </span>
        </label>
        <label className={c.field}>
          <span>Bag size</span>
          <span className={c.inputRow}>
            <input inputMode="decimal" value={bag} onChange={(e) => setBag(e.target.value)} />
            <span className={c.unit}>kg</span>
          </span>
        </label>
      </div>
      {kg ? (
        <div className={c.result}>
          <div className={c.resultLabel}>Seed needed</div>
          <div className={c.resultMain}>{fig(kg)} kg</div>
          <ul className={c.resultList}>
            <li>
              {fig(kgHa)} kg/ha ({fig(kgHa / ACRES_PER_HA)} kg an acre) over {fig(ha)} ha ({fig(ha * ACRES_PER_HA)} acres).
            </li>
            {bags && (
              <li>
                <strong>
                  {Math.ceil(bags - 1e-9)} {Math.ceil(bags - 1e-9) === 1 ? 'bag' : 'bags'}
                </strong>{' '}
                of {fig(num(bag))} kg{Math.abs(bags - Math.ceil(bags - 1e-9)) > 0.01 ? ` (${fig(bags)} to be exact)` : ''}.
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className={c.empty}>Enter the area and the answer appears here.</p>
      )}
    </section>
  );
}
