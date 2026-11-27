import type { Metadata } from 'next';
import Link from 'next/link';
import { ACRES_PER_HA, fig, knapsack } from '@/lib/info/sprayMaths';
import { InfoHelp } from '../InfoHelp';
import { InfoFrame } from '../InfoFrame';
import { SprayCalculators } from './SprayCalculators';
import c from '../calc.module.css';

export const metadata: Metadata = {
  title: 'Spray Rate Calculator: Tank Mix, Knapsack and Sprayer Calibration',
  description:
    'Work out how much product and water go in the tank for the area in front of you, the dose for a knapsack, and what your sprayer is really putting on per hectare and per acre.',
  alternates: { canonical: '/info/spray-rates' },
};

const VOLUMES = [100, 200, 300, 400];
const DOSES = [0.5, 1, 2, 3, 4, 5];

export default function SprayRatesPage() {
  return (
    <InfoFrame
      slug="spray-rates"
      crumb="Spray rates"
      eyebrow="Info · Spraying"
      title={
        <>
          How much goes in the tank, <em>for the area in front of you.</em>
        </>
      }
      sub="Labels give a dose and a water volume per hectare. Fields come in acres and tanks in litres. These three sums bridge the gap."
    >
      <SprayCalculators />

      <InfoHelp title="The sums, nozzles and the rules">
        <section className={c.prose}>
          <h2>The sums, written out</h2>
          <h3>Per hectare and per acre</h3>
          <p>
            One hectare is {fig(ACRES_PER_HA)} acres, so a dose per acre is the dose per hectare divided by {fig(ACRES_PER_HA)}. As near as makes no
            difference, a rate per acre is four tenths of the rate per hectare.
          </p>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th scope="col">Per hectare</th>
                  <th scope="col">Per acre</th>
                </tr>
              </thead>
              <tbody>
                {DOSES.map((d) => (
                  <tr key={d}>
                    <td>{d} L</td>
                    <td>{fig((d * 1000) / ACRES_PER_HA)} ml</td>
                  </tr>
                ))}
                {VOLUMES.map((v) => (
                  <tr key={v}>
                    <td>{v} L of water</td>
                    <td>{fig(v / ACRES_PER_HA)} L of water</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
  
          <h3>Product in the tank</h3>
          <p>
            A tank covers its size divided by the water volume: 600 litres at 200 L/ha covers 3 hectares. The product for a full tank is that area times
            the dose: at 2 L/ha, 6 litres. Work the last, part tank out separately and mix only what the remaining area needs.
          </p>
  
          <h3>Knapsack: millilitres in a 15 litre fill</h3>
          <p>For a label dose per hectare, at the water volume along the top:</p>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th scope="col">Dose</th>
                  {[200, 400, 1000].map((v) => (
                    <th scope="col" key={v}>
                      {v} L/ha
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOSES.map((d) => (
                  <tr key={d}>
                    <td>{d} L/ha</td>
                    {[200, 400, 1000].map((v) => (
                      <td key={v}>{fig(knapsack(d, v, 15)!.productMl)} ml</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td>One fill covers</td>
                  {[200, 400, 1000].map((v) => (
                    <td key={v}>{fig(knapsack(1, v, 15)!.m2)} m²</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Many grassland herbicides give a separate knapsack or spot-treatment rate on the label, as millilitres in 10 litres of water. Where they do,
            that is the rate to use, not this table.
          </p>
  
          <h3>Calibration</h3>
          <p>
            Litres per hectare = nozzle output in litres a minute × 600 ÷ (speed in km/h × nozzle spacing in metres). For speed, time the tractor over
            100 metres: 360 divided by the seconds is the speed in km/h. Check every nozzle, not one.
          </p>
          <p>
            A knapsack is checked by measuring: spray water along a measured run, then litres used ÷ distance in metres ÷ swath width in metres × 10,000
            is the litres per hectare. Two litres over 100 metres with a 1.2 metre swath is 167 L/ha.
          </p>
  
          <h2>Water volume and nozzles</h2>
          <p>
            The label sets both. As a guide to what you will find, the common grassland herbicides ask for 200 to 400 litres of water a hectare at a
            medium spray quality, and some allow the lower end only with three-star drift-reducing nozzles. A knapsack rate, where the label gives one,
            is so many millilitres in 10 litres of water.
          </p>
  
          <h2>Near water</h2>
          <p>
            There is no single distance: the buffer zone is on the label. For a product in the LERAP scheme the standard is 5 metres from the top of the
            bank with a boom sprayer, and 1 metre with a knapsack held low and pointing down. A local assessment (LERAP) can bring the 5 metres down to
            1 where the ditch is dry or three-star low-drift nozzles are used; the assessment has to be written down and kept for three years. A buffer
            of more than 5 metres on a label cannot be reduced.
          </p>
  
          <h2>Sprayer testing</h2>
          <ul>
            <li>Boom sprayers wider than 3 metres: a National Sprayer Testing Scheme test every three years.</li>
            <li>Booms of 3 metres or less, and weed wipers: every six years.</li>
            <li>New machines: first test before they are five years old.</li>
            <li>Knapsacks and other hand-held kit: no test, but a regular check by someone competent, with a record kept.</li>
            <li>Farm assurance schemes ask for a test every year.</li>
          </ul>
          <p>
            Once the sprayer is right, the weather has to be. <Link href="/info/work-windows">Work windows</Link> rates the hours ahead for your postcode,
            and the <Link href="/info/spray-diary">spray diary</Link> keeps the record.
          </p>
          <p className={c.fine}>
            The label is the law: never exceed its maximum dose, and use the water volume and spray quality it gives. These sums are a check on your own,
            not a replacement for them.
          </p>
        </section>
      </InfoHelp>
    </InfoFrame>
  );
}
