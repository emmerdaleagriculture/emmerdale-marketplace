import type { Metadata } from 'next';
import Link from 'next/link';
import { GRAZING_N, LIMING_FACTORS, MANURES, PK_ROWS, RB209_URL, SILAGE_N } from '@/lib/info/fertData';
import { unitsPerAcre } from '@/lib/info/fertMaths';
import { fig } from '@/lib/info/sprayMaths';
import { InfoHelp } from '../InfoHelp';
import { InfoFrame } from '../InfoFrame';
import { FertCalculator } from './FertCalculator';
import c from '../calc.module.css';

export const metadata: Metadata = {
  title: 'Fertilising Grassland: Rates, Soil Indices and a Bag Calculator',
  description:
    'How much nitrogen, phosphate and potash grass needs for grazing, hay and silage by soil index, from RB209, with a calculator that turns kg per hectare into bags for your field.',
  alternates: { canonical: '/info/fertiliser' },
};

export default function FertiliserPage() {
  return (
    <InfoFrame
      slug="fertiliser"
      crumb="Fertilising"
      eyebrow="Info · Soil and grass"
      title={
        <>
          What grass needs, <em>and how many bags that is.</em>
        </>
      }
      sub="The rates are from AHDB’s Nutrient Management Guide (RB209), March 2026. The calculator turns them into product per acre and bags for the field."
    >
      <FertCalculator />

      <InfoHelp title="Soil indices, nitrogen, lime and muck">
        <section className={c.prose}>
          <h2>Start with a soil test</h2>
          <p>
            Phosphate, potash and lime are put on to what the soil lacks, so nothing below can be used without a soil analysis. Sample every three to
            five years: 25 cores in a W across the field, to 7.5 cm on long-term grass, one sample for every 4 hectares or less. In England the Farming
            Rules for Water require a test no more than five years old before fertiliser or manure goes on cultivated land.
          </p>
          <p>The targets are phosphate index 2 and potash index 2-. At those you replace what the crop takes; below them you build up; above them you save your money.</p>
  
          <h2>Phosphate and potash, by soil index</h2>
          <p>Kilograms a hectare for the season. Multiply by 0.8 for units an acre.</p>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th scope="col">Use</th>
                  <th scope="col">Nutrient</th>
                  {['0', '1', '2', '3', '4+'].map((i) => (
                    <th scope="col" key={i}>
                      Index {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PK_ROWS.map((r) => (
                  <tr key={r.use + r.nutrient}>
                    <td>{r.use}</td>
                    <td>{r.nutrient}</td>
                    {r.byIndex.map((v, i) => (
                      <td key={i}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Hay takes a great deal of potash off the field: about 18 kg for every tonne carted away, against 6 kg of phosphate. A paddock cut for hay
            year after year and given nothing back runs down fast.
          </p>
  
          <h2>Nitrogen</h2>
          <p>
            Nitrogen is put on for the grass you want to grow, not to a soil index. The figures assume a soil of moderate nitrogen supply and little
            clover; take off whatever manure supplies.
          </p>
          <h3>Grazing</h3>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th scope="col">Grass wanted (t dry matter/ha)</th>
                  <th scope="col">Nitrogen for the season</th>
                  <th scope="col">Units an acre</th>
                </tr>
              </thead>
              <tbody>
                {GRAZING_N.map((r) => (
                  <tr key={r.yieldT}>
                    <td>{r.yieldT}</td>
                    <td>{r.totalN} kg/ha</td>
                    <td>{fig(unitsPerAcre(r.totalN))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            It goes on in dressings of 20 to 50 kg/ha, the first in March, one for each grazing round. Nitrogen after August is not usually productive.
            Poor ground, and ground short of summer rain, sits at the bottom of the table whatever you put on.
          </p>
          <h3>Hay and silage</h3>
          <p>
            Hay: 100 kg N/ha a cut on a soil of low nitrogen supply, 70 on moderate, 40 on high. Silage and haylage, kg N/ha for each cut:
          </p>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th scope="col">Yield wanted (t DM/ha)</th>
                  <th scope="col">1st</th>
                  <th scope="col">2nd</th>
                  <th scope="col">3rd</th>
                  <th scope="col">4th</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {SILAGE_N.map((r) => (
                  <tr key={r.yieldT}>
                    <td>{r.yieldT}</td>
                    {r.cuts.map((n, i) => (
                      <td key={i}>{n ?? ''}</td>
                    ))}
                    <td>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Clover</h3>
          <p>A sward that is 30 to 40% clover grows about as much as pure grass given 180 kg N/ha. Bagged nitrogen on top of that mostly replaces the clover’s.</p>
  
          <h2>Horse paddocks</h2>
          <p>
            RB209 has no figures for horses, and the rates above are for cattle and sheep making the most of the grass. For horses the aim is usually the
            opposite. The British Horse Society gives no rate at all: it says to avoid over-fertilising, because lush grass brings laminitis, to take
            advice, and never to spread horse manure back on horse pasture. Teagasc’s equine advice is 25 to 40 kg N/ha a year on grazing, 25 of it in
            spring, and 100 kg N/ha for a hay or haylage crop. Phosphate, potash and lime still go on to the soil test.
          </p>
  
          <h2>Lime</h2>
          <p>
            Grass on a mineral soil wants pH 6.0; 6.5 where clover matters. The lime to put on, in tonnes of ground limestone a hectare, is the gap
            between the pH you have and 0.2 above the pH you want, times the factor for the soil. No more than 7 t/ha at once on established grass.
          </p>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th scope="col">Soil</th>
                  <th scope="col">pH wanted</th>
                  <th scope="col">t/ha per pH point</th>
                </tr>
              </thead>
              <tbody>
                {LIMING_FACTORS.map((l) => (
                  <tr key={l.soil}>
                    <td>{l.soil}</td>
                    <td>{l.optimum.toFixed(1)}</td>
                    <td>{l.factor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>So a clay loam at pH 5.6, wanted at 6.0: (6.2 − 5.6) × 6 = 3.6 t/ha, about 1.5 tonnes an acre.</p>
  
          <h2>Sulphur and magnesium</h2>
          <p>
            On soils at risk of deficiency, grazing wants 20 to 30 kg SO₃/ha for every 100 kg of nitrogen applied, and
            silage 40 kg SO₃/ha before each cut. At magnesium index 0, 50 to 100 kg MgO/ha every three or four years. Where grass staggers is a risk,
            keep potash off in spring.
          </p>
  
          <h2>What is in muck</h2>
          <p>Kilograms in each tonne or cubic metre as spread. The figure in brackets is what the next crop can use.</p>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th scope="col">Material</th>
                  <th scope="col">Nitrogen</th>
                  <th scope="col">Phosphate</th>
                  <th scope="col">Potash</th>
                </tr>
              </thead>
              <tbody>
                {MANURES.map((m) => (
                  <tr key={m.name}>
                    <td>
                      {m.name}, per {m.per}
                    </td>
                    <td>{m.n}</td>
                    <td>
                      {m.p[0]} ({m.p[1]})
                    </td>
                    <td>
                      {m.k[0]} ({m.k[1]})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Only about 5% of the nitrogen in farmyard manure spread on the surface reaches the next crop; its value is the phosphate and potash.</p>
  
          <h2>The limits</h2>
          <ul>
            <li>
              In an English Nitrate Vulnerable Zone: no more than 250 kg of total nitrogen a hectare from organic manures on any field in twelve months,
              170 kg/ha a year from livestock manure averaged over the holding, and 300 kg N/ha in all on grass (340 if cut three times or more).
            </li>
            <li>
              Closed periods for nitrogen and slurry are on <Link href="/info/calendar">the calendar</Link>, and{' '}
              <Link href="/info/work-windows">work windows</Link> rates the days ahead for spreading.
            </li>
            <li>
              Urea: under the Red Tractor standard in England, plain solid urea may only be used between 15 January and 31 March; outside that it must
              be the inhibited (“protected”) kind. That is a farm-assurance rule rather than the law.
            </li>
          </ul>
          <p className={c.fine}>
            Figures from the <a href={RB209_URL}>AHDB Nutrient Management Guide (RB209)</a>, March 2026, Sections 1 to 3; GOV.UK on Nitrate Vulnerable
            Zones and the Farming Rules for Water; the British Horse Society; Teagasc. They are general recommendations. A FACTS-qualified adviser can
            set rates for your own soil and stock.
          </p>
        </section>
      </InfoHelp>
    </InfoFrame>
  );
}
