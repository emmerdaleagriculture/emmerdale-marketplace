import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoFrame } from '../InfoFrame';
import { AreaMapper } from './AreaMapper';
import c from '../calc.module.css';

export const metadata: Metadata = {
  title: 'Field Area Map: Measure Acres, Hectares and Hedge Lengths',
  description:
    'Measure a field on a satellite map: tap round the edge or walk it with your phone’s GPS for the area in acres and hectares and the length round it. Hedges and fence runs too.',
  alternates: { canonical: '/info/area-map' },
};

export default function AreaMapPage() {
  return (
    <InfoFrame
      slug="area-map"
      crumb="Area map"
      eyebrow="Info · Measuring"
      title={
        <>
          Measure a field, <em>on the map or on foot.</em>
        </>
      }
      sub="Tap round the edge on the satellite picture, or walk it with your phone, and read the acres, the hectares and the length round it. Switch to a length for a hedge or a fence run."
    >
      <AreaMapper />

      <section className={c.prose}>
        <h2>How to get a good figure</h2>
        <ul>
          <li>
            <strong>Zoom right in</strong> before you tap, and put each corner on the hedge line or fence, not the middle of the headland.
          </li>
          <li>
            <strong>Go round in order.</strong> Tapping across the field draws an outline that crosses itself, and there is no area to give for that.
          </li>
          <li>
            <strong>Curved edges</strong> want a corner every few metres along the bend. A few extra corners cost nothing; missing a bend can cost
            a tenth of a small paddock.
          </li>
          <li>
            <strong>Walking the edge</strong> drops a point every few metres from the phone’s GPS, which is good to a few metres in the open and
            worse under trees. Keep the screen on and walk steadily. You can still drag any corner afterwards.
          </li>
          <li>
            The area is flat map area. On a steep bank the ground itself is a little larger, and so is the spray or seed it takes.
          </li>
        </ul>

        <h2>Conversions</h2>
        <div className={c.tableWrap}>
          <table className={c.table}>
            <tbody>
              <tr>
                <td>1 hectare</td>
                <td>2.471 acres · 10,000 m²</td>
              </tr>
              <tr>
                <td>1 acre</td>
                <td>0.405 ha · 4,047 m² · 4,840 square yards</td>
              </tr>
              <tr>
                <td>A 100 m square</td>
                <td>1 hectare</td>
              </tr>
              <tr>
                <td>A football pitch</td>
                <td>about 1.75 acres (0.7 ha)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          Once a field is measured, the links under the answer carry its acres into the <Link href="/info/spray-rates">spray</Link>,{' '}
          <Link href="/info/fertiliser">fertiliser</Link> and <Link href="/info/seeding">seed</Link> calculators.
        </p>
        <p className={c.fine}>
          Worked out on your phone or computer; the outline isn’t sent anywhere. Satellite imagery can be a year or more old and a few metres out of
          line, so for a sale, a lease or a grant claim use the Rural Payments map or a surveyor.
        </p>
      </section>
    </InfoFrame>
  );
}
