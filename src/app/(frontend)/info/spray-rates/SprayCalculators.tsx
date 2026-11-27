'use client';

import { useState, type ReactNode } from 'react';
import { ACRES_PER_HA, fig, kmhFrom100m, knapsack, litresPerHa, nozzleOutput, tankMix, toHa } from '@/lib/info/sprayMaths';
import { useAcresParam } from '@/lib/info/useAcresParam';
import c from '../calc.module.css';

/**
 * The three sums a sprayer operator does: what goes in the tank, what goes
 * in a knapsack, and what the sprayer is actually putting on. All worked in
 * the browser from src/lib/info/sprayMaths.ts; nothing is sent anywhere.
 */

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : NaN;
};

function Field({ label, value, onChange, unit, children }: { label: string; value: string; onChange: (v: string) => void; unit?: string; children?: ReactNode }) {
  return (
    <label className={c.field}>
      <span>{label}</span>
      <span className={c.inputRow}>
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
        {unit && <span className={c.unit}>{unit}</span>}
        {children}
      </span>
    </label>
  );
}

function TankMix() {
  const [area, setArea] = useState('');
  const [areaUnit, setAreaUnit] = useState<'acre' | 'ha'>('acre');
  useAcresParam((a) => {
    setArea(a);
    setAreaUnit('acre');
  });
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<'L' | 'kg'>('L');
  const [water, setWater] = useState('200');
  const [tank, setTank] = useState('');
  const ha = toHa(num(area), areaUnit);
  const m = tankMix(ha, num(dose), num(water), num(tank));
  const small = doseUnit === 'L' ? 'ml' : 'g';
  /** Under one litre or kilo reads better in millilitres or grams. */
  const amount = (n: number) => (n < 1 ? `${fig(n * 1000)} ${small}` : `${fig(n)} ${doseUnit}`);
  return (
    <section className={c.calc}>
      <h2 className={c.calcTitle}>What goes in the tank</h2>
      <p className={c.calcLede}>The dose and the water volume are on the label, per hectare.</p>
      <div className={c.fields}>
        <Field label="Area to spray" value={area} onChange={setArea}>
          <select aria-label="Area unit" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as 'acre' | 'ha')}>
            <option value="acre">acres</option>
            <option value="ha">ha</option>
          </select>
        </Field>
        <Field label="Dose per hectare" value={dose} onChange={setDose}>
          <select aria-label="Dose unit" value={doseUnit} onChange={(e) => setDoseUnit(e.target.value as 'L' | 'kg')}>
            <option value="L">L/ha</option>
            <option value="kg">kg/ha</option>
          </select>
        </Field>
        <Field label="Water volume" value={water} onChange={setWater} unit="L/ha" />
        <Field label="Tank size" value={tank} onChange={setTank} unit="litres" />
      </div>
      {m ? (
        <div className={c.result}>
          <div className={c.resultLabel}>Product for the job</div>
          <div className={c.resultMain}>
            {amount(m.product)} in {fig(m.spray)} L of spray
          </div>
          <ul className={c.resultList}>
            <li>
              Area: <strong>{fig(ha)} ha</strong> ({fig(ha * ACRES_PER_HA)} acres). Dose per acre:{' '}
              <strong>{amount(num(dose) / ACRES_PER_HA)}</strong> in {fig(num(water) / ACRES_PER_HA)} L of water.
            </li>
            {m.fills === 1 ? (
              <li>
                One fill: <strong>{amount(m.lastProduct)}</strong> of product, made up to <strong>{fig(m.lastSpray)} L</strong>.
              </li>
            ) : (
              <>
                <li>
                  {m.fills - 1} full {m.fills - 1 === 1 ? 'tank' : 'tanks'}: <strong>{amount(m.productPerFullTank)}</strong> of product in each, covering{' '}
                  {fig(m.haPerTank)} ha ({fig(m.haPerTank * ACRES_PER_HA)} acres).
                </li>
                <li>
                  Last fill: <strong>{amount(m.lastProduct)}</strong> of product, made up to <strong>{fig(m.lastSpray)} L</strong>.
                </li>
              </>
            )}
          </ul>
        </div>
      ) : (
        <p className={c.empty}>Fill in all four and the answer appears here.</p>
      )}
    </section>
  );
}

function Knapsack() {
  const [dose, setDose] = useState('');
  const [water, setWater] = useState('400');
  const [fill, setFill] = useState('15');
  const k = knapsack(num(dose), num(water), num(fill));
  return (
    <section className={c.calc}>
      <h2 className={c.calcTitle}>Knapsack</h2>
      <p className={c.calcLede}>
        For a label that gives a dose per hectare. Where the label gives its own knapsack or spot-treatment rate (so many ml in 10 litres), use the label’s.
      </p>
      <div className={c.fields}>
        <Field label="Dose per hectare" value={dose} onChange={setDose} unit="L/ha" />
        <Field label="Water volume" value={water} onChange={setWater} unit="L/ha" />
        <Field label="Water in the knapsack" value={fill} onChange={setFill} unit="litres" />
      </div>
      {k ? (
        <div className={c.result}>
          <div className={c.resultLabel}>In each fill</div>
          <div className={c.resultMain}>{fig(k.productMl)} ml of product</div>
          <ul className={c.resultList}>
            <li>
              One fill covers <strong>{fig(k.m2)} m²</strong>, about {fig(Math.sqrt(k.m2))} m by {fig(Math.sqrt(k.m2))} m.
            </li>
            <li>That only holds if you walk and pump at the pace that puts on {fig(num(water))} L/ha. Check it: spray water over a measured 100 m² and see what it took.</li>
          </ul>
        </div>
      ) : (
        <p className={c.empty}>Fill in all three and the answer appears here.</p>
      )}
    </section>
  );
}

function Calibration() {
  const [output, setOutput] = useState('');
  const [secs, setSecs] = useState('');
  const [spacing, setSpacing] = useState('0.5');
  const [target, setTarget] = useState('200');
  const kmh = kmhFrom100m(num(secs));
  const lha = kmh ? litresPerHa(num(output), kmh, num(spacing)) : null;
  const need = kmh ? nozzleOutput(num(target), kmh, num(spacing)) : null;
  return (
    <section className={c.calc}>
      <h2 className={c.calcTitle}>Check the sprayer</h2>
      <p className={c.calcLede}>
        Time the tractor over 100 metres in the gear and revs you will spray in. Catch one nozzle’s output for a minute in a jug, at spraying pressure.
      </p>
      <div className={c.fields}>
        <Field label="Time over 100 m" value={secs} onChange={setSecs} unit="seconds" />
        <Field label="One nozzle in a minute" value={output} onChange={setOutput} unit="litres" />
        <Field label="Nozzle spacing" value={spacing} onChange={setSpacing} unit="metres" />
        <Field label="Volume you want" value={target} onChange={setTarget} unit="L/ha" />
      </div>
      {kmh ? (
        <div className={c.result}>
          <div className={c.resultLabel}>Forward speed</div>
          <div className={c.resultMain}>
            {fig(kmh)} km/h ({fig(kmh * 0.621371)} mph)
          </div>
          <ul className={c.resultList}>
            {lha && (
              <li>
                The sprayer is putting on <strong>{fig(lha)} L/ha</strong> ({fig(lha / ACRES_PER_HA)} L/acre).
              </li>
            )}
            {need && (
              <li>
                For {fig(num(target))} L/ha at this speed each nozzle must give <strong>{fig(need)} L/min</strong>.
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className={c.empty}>Start with the time over 100 metres.</p>
      )}
    </section>
  );
}

export function SprayCalculators() {
  return (
    <>
      <TankMix />
      <Knapsack />
      <Calibration />
    </>
  );
}
