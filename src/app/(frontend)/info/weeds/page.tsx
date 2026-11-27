import type { Metadata } from 'next';
import Link from 'next/link';
import { ALSO_POISONOUS, WEEDS, WEEDS_CHECKED } from '@/lib/info/weeds';
import { InfoHelp } from '../InfoHelp';
import { InfoFrame } from '../InfoFrame';
import { WeedPhoto } from './WeedPhoto';
import c from '../calc.module.css';
import css from './weeds.module.css';

export const metadata: Metadata = {
  title: 'Grassland Weeds: What Controls Them, With or Without Horses',
  description:
    'Pick a paddock weed, say whether horses, cattle or sheep graze the field, and see which herbicides control it: dose, days stock stay out, and which may not be used on horse paddocks.',
  alternates: { canonical: '/info/weeds' },
};

export default function WeedsPage() {
  const names = Object.fromEntries(WEEDS.map((w) => [w.slug, w.name]));
  return (
    <InfoFrame
      slug="weeds"
      crumb="Name that weed"
      eyebrow="Info · Spraying"
      title={
        <>
          Name the weed, <em>then see what controls it.</em>
        </>
      }
      sub="Each weed has its timing and the herbicides for it, sifted by what grazes the field: several of the best-known may not go on a horse paddock at all."
    >
      <WeedPhoto names={names} />

      <h2 className={css.h2}>Pick it from the list</h2>
      <ul className={css.weedList}>
        {WEEDS.map((w) => (
          <li key={w.slug}>
            <Link href={`/info/weeds/${w.slug}`} className={css.weedLink}>
              <span>
                <span className={css.weedName}>{w.name}</span>
                <em className={css.weedLatin}>{w.latin}</em>
              </span>
              <span className={css.weedTags}>
                {w.poison && <span className={css.tagPoison}>Poisonous</span>}
                {w.injurious && <span className={css.tag}>Injurious</span>}
                <span aria-hidden="true">›</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className={css.note}>
        The British Horse Society also lists {ALSO_POISONOUS.slice(0, -1).join(', ')} and {ALSO_POISONOUS[ALSO_POISONOUS.length - 1]} as poisonous to
        horses. We hold no treatment notes for those: dig or fence them out.
      </p>

      <InfoHelp title="Who may spray, and the law">
        <section className={c.prose} id="law">
          <h2>Who may spray</h2>
          <ul>
            <li>
              Every herbicide on these pages is a professional product. Anyone using one must hold a recognised certificate of competence, or be working
              under the direct supervision of someone who does, as training. The old exemption for those born before 1965 ended on 26 November 2015.
            </li>
            <li>
              No product sold to the public is authorised for use on grassland: the HSE register lists none. A paddock owner without a certificate needs
              a contractor who has one.
            </li>
            <li>
              A business or sole trader using professional products in England, Scotland or Wales must register with Defra within three months of
              starting.
            </li>
            <li>
              Every application must be recorded and the record kept for three years. The <Link href="/info/spray-diary">spray diary</Link> does that.
            </li>
            <li>
              These pages set out what labels and makers say. They are not a recommendation for your field: for that, the law expects whoever advises
              you to be suitably qualified, and HSE’s expectation is a BASIS certificate.
            </li>
          </ul>
  
          <h2>Injurious weeds</h2>
          <p>
            The Weeds Act 1959 names five: common ragwort, spear thistle, creeping thistle, curled dock and broad-leaved dock. You may have them on
            your land, but you should stop them spreading, and you can be served a notice to do so. If you keep horses or livestock you must not graze
            them where you know ragwort is present.
          </p>
  
          <h2>Before and after</h2>
          <p>
            <Link href="/info/work-windows">Work windows</Link> rates the hours ahead for spraying, <Link href="/info/spray-rates">spray rates</Link>{' '}
            works out the tank, and the <Link href="/info/calendar">calendar</Link> has the months.
          </p>
          <p className={c.fine}>
            Checked against product labels, makers’ technical sheets, HSE authorisation notices and the HSE pesticides register on {WEEDS_CHECKED}.
            Labels change and authorisations end: the label on the container is the law.
          </p>
        </section>
      </InfoHelp>
    </InfoFrame>
  );
}
