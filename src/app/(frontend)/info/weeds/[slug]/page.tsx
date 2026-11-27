import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WEEDS, WEEDS_CHECKED } from '@/lib/info/weeds';
import { InfoFrame } from '../../InfoFrame';
import { WeedOptions } from '../WeedOptions';
import c from '../../calc.module.css';
import css from '../weeds.module.css';

export const dynamicParams = false;
export function generateStaticParams() {
  return WEEDS.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const w = WEEDS.find((x) => x.slug === slug);
  if (!w) return {};
  return {
    title: `${w.name}: How to Control It in Grassland and Horse Paddocks`,
    description: `When to treat ${w.name.toLowerCase()} and which herbicides control it, with the dose, the days stock must stay out and which products may not be used where horses graze.`,
    alternates: { canonical: `/info/weeds/${w.slug}` },
  };
}

export default async function WeedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const w = WEEDS.find((x) => x.slug === slug);
  if (!w) notFound();
  return (
    <InfoFrame
      slug="weeds"
      crumb={w.name}
      eyebrow="Info · Name that weed"
      title={
        <>
          {w.name}, <em>and what controls it.</em>
        </>
      }
      sub={
        <>
          <em>{w.latin}</em>
          {w.injurious && '. One of the five injurious weeds a landowner can be ordered to stop spreading.'}
        </>
      }
    >
      {w.poison && <p className={css.poison}>{w.poison}</p>}
      {w.warning && <p className={css.warning}>{w.warning}</p>}

      <section className={css.when}>
        <h2 className={css.h2}>When</h2>
        <p>{w.timing}</p>
        {w.without && (
          <>
            <h2 className={css.h2}>Without a sprayer</h2>
            <p>{w.without}</p>
          </>
        )}
      </section>

      <WeedOptions weed={w} />

      <section className={c.prose}>
        <h2>Reading these</h2>
        <ul>
          <li>
            <strong>On the label</strong> means the maker names this weed on the product label. <strong>Maker’s rating</strong> is from the maker’s
            technical sheet, which is guidance and not a label claim. <strong>Maker’s chart</strong> is a two or three star mark on a sales chart,
            given as an indication only.
          </li>
          <li>
            Every product here is for professional use: whoever sprays it needs a certificate of competence. No weedkiller sold to the public is
            authorised for grassland. More on <Link href="/info/weeds#law">who may spray</Link>.
          </li>
          <li>All of them kill or damage clover unless it says otherwise.</li>
        </ul>
        <p className={c.fine}>
          Checked against labels, makers’ sheets and the HSE register on {WEEDS_CHECKED}. Labels change and authorisations end. The label on the
          container in your hand is the law; read it before you mix. <Link href="/info/weeds">All weeds</Link>.
        </p>
      </section>
    </InfoFrame>
  );
}
