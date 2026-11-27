import type { Metadata } from 'next';
import Link from 'next/link';
import { ACRES_PER_HA, fig } from '@/lib/info/sprayMaths';
import { InfoHelp } from '../InfoHelp';
import { InfoFrame } from '../InfoFrame';
import { SeedCalculator } from './SeedCalculator';
import c from '../calc.module.css';

export const metadata: Metadata = {
  title: 'Grass Seed Rates: Reseeding, Overseeding and Horse Paddocks',
  description:
    'Seed rates per acre and per hectare for a new ley, overseeding, clover and horse paddocks, when and how deep to sow, and a calculator for the seed your field needs.',
  alternates: { canonical: '/info/seeding' },
};

/** kg/ha ranges, with where each comes from. `trade` marks a seed house's figure. */
const RATES: { job: string; lo: number; hi: number; source: string; trade?: boolean }[] = [
  { job: 'Full grass reseed', lo: 18, hi: 35, source: 'AHDB' },
  { job: 'Overseeding a thin sward', lo: 20, hi: 37, source: 'AHDB (8 to 15 kg an acre)' },
  { job: 'Herbal ley, full reseed', lo: 30, hi: 35, source: 'AHDB' },
  { job: 'Herbal ley, overseeded', lo: 5, hi: 8, source: 'AHDB' },
  { job: 'White clover in a mixture', lo: 1, hi: 4, source: 'AHDB' },
  { job: 'White clover into an existing sward', lo: 4, hi: 4, source: 'AHDB' },
  { job: 'Red clover on its own', lo: 15, hi: 15, source: 'AHDB' },
  { job: 'Horse paddock, new', lo: 32.5, hi: 35, source: 'Cotswold Seeds', trade: true },
  { job: 'Horse paddock, overseeded', lo: 20, hi: 25, source: 'Cotswold Seeds', trade: true },
  { job: 'Gateways and poached patches', lo: 50, hi: 50, source: 'Cotswold Seeds', trade: true },
];

const PRESETS = [
  { label: 'Horse paddock, new (14 kg/acre)', kgAcre: 14 },
  { label: 'Horse paddock, overseed (10 kg/acre)', kgAcre: 10 },
  { label: 'Full grass reseed (14 kg/acre)', kgAcre: 14 },
  { label: 'Overseeding (8 kg/acre)', kgAcre: 8 },
  { label: 'Gateway repair (20 kg/acre)', kgAcre: 20 },
];

const range = (lo: number, hi: number, f: (n: number) => number) => (lo === hi ? fig(f(lo)) : `${fig(f(lo))} to ${fig(f(hi))}`);

export default function SeedingPage() {
  return (
    <InfoFrame
      slug="seeding"
      crumb="Seeding"
      eyebrow="Info · Soil and grass"
      title={
        <>
          Seed rates, <em>and when the ground is ready.</em>
        </>
      }
      sub="How much seed a job takes, how deep and when to sow it, and what suits a horse paddock. The bag’s own rate comes first where it differs."
    >
      <SeedCalculator presets={PRESETS} />

      <InfoHelp title="Seed rates, when and how">
        <section className={c.prose}>
          <h2>Seed rates</h2>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">kg/ha</th>
                  <th scope="col">kg/acre</th>
                  <th scope="col">From</th>
                </tr>
              </thead>
              <tbody>
                {RATES.map((r) => (
                  <tr key={r.job}>
                    <td>{r.job}</td>
                    <td>{range(r.lo, r.hi, (n) => n)}</td>
                    <td>{range(r.lo, r.hi, (n) => n / ACRES_PER_HA)}</td>
                    <td>
                      {r.source}
                      {r.trade && ' (seed house)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>With red clover in a grass mixture, AHDB’s figure is 7 kg/ha of clover to 22 kg/ha of grass.</p>

          <h2>When</h2>
          <ul>
            <li>
              Soil at 8°C or more for a full reseed, and moisture to follow. <Link href="/info/work-windows">Work windows</Link> rates the days ahead.
            </li>
            <li>Spring sowings go in from April; autumn reseeds from mid-August to mid-September.</li>
            <li>White clover from April to August, and in a mixture no later than September. Red clover from April to late July.</li>
            <li>Overseeding does best from midsummer on.</li>
          </ul>

          <h2>How</h2>
          <ul>
            <li>
              <strong>Depth.</strong> Grass seed at 1 to 2 cm, clover at under 1 cm. Sown 5 cm deep, only one seedling in five comes up.
            </li>
            <li>
              <strong>Roll.</strong> Firming the seedbed after sowing matters more than almost anything else: you should leave no footprints.
            </li>
            <li>
              <strong>Overseeding.</strong> Graze or mow the old sward down to 4 or 5 cm first. It needs about 40% bare ground to take. Drilled seed
              germinates 15 to 25% better than broadcast; if you broadcast, harrow before and after, then roll.
            </li>
            <li>
              <strong>Ploughing</strong> is the most reliable and the dearest. <strong>Direct drilling</strong> is the cheapest and the least certain,
              and no good on dry, hard ground. After spraying off an old sward, wait 7 to 10 days before cultivating.
            </li>
          </ul>

          <h2>Afterwards</h2>
          <ul>
            <li>Graze when a seedling stays in the ground if you pull at it. The British Horse Society’s rule for horses is grass five to six inches long.</li>
            <li>Graze lightly at first, and take no silage in the first year.</li>
            <li>Weeds in a new ley are sprayed young, when the grass has two or three leaves and before the first grazing. Clover limits what you can use.</li>
          </ul>

          <h2>For horses</h2>
          <p>
            The British Horse Society’s list for horse pasture is smooth-stalked meadow grass, the fescues (creeping red, chewings, sheep’s and tall),
            white clover in small quantities, and herbs such as plantain, yarrow, chicory and burnet. It does not list ryegrass.
          </p>
          <p>
            Seed houses sell two kinds of horse mixture. General-purpose ones are mostly perennial ryegrass (70% in one large supplier’s).
            Ryegrass-free ones are built on meadow fescue, timothy, smooth-stalked meadow grass and the fine fescues; the seed houses themselves say
            their ryegrass mixtures are not suitable for horses and ponies prone to laminitis or equine metabolic syndrome. Ask what is in the bag before you buy.
          </p>
          <p className={c.fine}>
            Figures from AHDB’s reseeding, overseeding and clover guides, the British Horse Society and Teagasc; the rows marked “seed house” are one
            supplier’s own recommendation and others differ. Follow the rate on the bag you buy.
          </p>
        </section>
      </InfoHelp>
    </InfoFrame>
  );
}
