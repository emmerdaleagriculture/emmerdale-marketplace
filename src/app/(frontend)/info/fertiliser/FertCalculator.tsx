'use client';

import { useState } from 'react';
import { GRADES, forArea, kgHaFromUnits, productRate, supplied, unitsPerAcre, type Analysis } from '@/lib/info/fertMaths';
import { ACRES_PER_HA, fig, toHa } from '@/lib/info/sprayMaths';
import c from '../calc.module.css';

/**
 * From the nutrient you want to the bags you need. Worked in the browser
 * from src/lib/info/fertMaths.ts.
 */
const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : NaN;
};
const NUTRIENTS = [
  { key: 'n', label: 'Nitrogen (N)' },
  { key: 'p', label: 'Phosphate (P₂O₅)' },
  { key: 'k', label: 'Potash (K₂O)' },
] as const;

export function FertCalculator() {
  const [nutrient, setNutrient] = useState<'n' | 'p' | 'k'>('n');
  const [rate, setRate] = useState('');
  const [rateUnit, setRateUnit] = useState<'kg' | 'units'>('kg');
  const [grade, setGrade] = useState(0);
  const [custom, setCustom] = useState({ n: '', p: '', k: '' });
  const [area, setArea] = useState('');
  const [areaUnit, setAreaUnit] = useState<'acre' | 'ha'>('acre');
  const [bag, setBag] = useState('600');

  const isCustom = grade === GRADES.length;
  const a: Analysis = isCustom ? { n: num(custom.n) || 0, p: num(custom.p) || 0, k: num(custom.k) || 0 } : GRADES[grade].a;
  const kgHa = rateUnit === 'kg' ? num(rate) : kgHaFromUnits(num(rate));
  const product = productRate(kgHa, a[nutrient]);
  const gives = product ? supplied(product, a) : null;
  const ha = toHa(num(area), areaUnit);
  const field = product ? forArea(product, ha, num(bag)) : null;
  const lacks = Number.isFinite(kgHa) && kgHa > 0 && !(a[nutrient] > 0);

  return (
    <section className={c.calc}>
      <h2 className={c.calcTitle}>From nutrient to bags</h2>
      <p className={c.calcLede}>Say what the grass needs and what is in the bag; the rest is arithmetic.</p>
      <div className={c.fields}>
        <label className={c.field}>
          <span>Nutrient</span>
          <span className={c.inputRow}>
            <select style={{ flex: 1, borderLeft: 0 }} value={nutrient} onChange={(e) => setNutrient(e.target.value as 'n' | 'p' | 'k')}>
              {NUTRIENTS.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className={c.field}>
          <span>Rate wanted</span>
          <span className={c.inputRow}>
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            <select aria-label="Rate unit" value={rateUnit} onChange={(e) => setRateUnit(e.target.value as 'kg' | 'units')}>
              <option value="kg">kg/ha</option>
              <option value="units">units/acre</option>
            </select>
          </span>
        </label>
        <label className={c.field}>
          <span>Fertiliser</span>
          <span className={c.inputRow}>
            <select style={{ flex: 1, borderLeft: 0 }} value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {GRADES.map((g, i) => (
                <option key={g.name} value={i}>
                  {g.name}
                </option>
              ))}
              <option value={GRADES.length}>Another grade</option>
            </select>
          </span>
        </label>
        {isCustom &&
          NUTRIENTS.map((n) => (
            <label className={c.field} key={n.key}>
              <span>{n.label}</span>
              <span className={c.inputRow}>
                <input inputMode="decimal" value={custom[n.key]} onChange={(e) => setCustom({ ...custom, [n.key]: e.target.value })} />
                <span className={c.unit}>%</span>
              </span>
            </label>
          ))}
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
      {product && gives ? (
        <div className={c.result}>
          <div className={c.resultLabel}>Spread</div>
          <div className={c.resultMain}>
            {fig(product)} kg/ha ({fig(product / ACRES_PER_HA)} kg an acre)
          </div>
          <ul className={c.resultList}>
            <li>
              That supplies{' '}
              {NUTRIENTS.filter((n) => gives[n.key] > 0)
                .map((n) => `${fig(gives[n.key])} kg/ha ${n.label.replace(/ \(.*/, '').toLowerCase()} (${fig(unitsPerAcre(gives[n.key]))} units an acre)`)
                .join(', ')}
              .
            </li>
            {field && (
              <li>
                For {fig(ha)} ha ({fig(ha * ACRES_PER_HA)} acres): <strong>{fig(field.kg)} kg</strong>, which is{' '}
                <strong>
                  {field.wholeBags} {field.wholeBags === 1 ? 'bag' : 'bags'}
                </strong>{' '}
                of {fig(num(bag))} kg{Math.abs(field.bags - field.wholeBags) > 0.01 ? ` (${fig(field.bags)} to be exact)` : ''}.
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className={c.empty}>{lacks ? 'That fertiliser has none of the nutrient you picked.' : 'Enter the rate you want and the answer appears here.'}</p>
      )}
    </section>
  );
}
