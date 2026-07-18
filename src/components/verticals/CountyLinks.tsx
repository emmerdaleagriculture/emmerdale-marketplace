import Link from 'next/link';
import { allCountyRefs, type VerticalKey, type CountyRef } from '@/lib/verticals';
import s from '@/app/(frontend)/landing.module.css';

/**
 * Region-grouped links to every per-county page for a vertical. Rendered on the
 * top-level vertical page so the county pages are internally linked (and thus
 * crawlable / rank-able), and so visitors can jump straight to their area.
 */
export async function CountyLinks({ vertical, heading }: { vertical: VerticalKey; heading: string }) {
  const refs = await allCountyRefs();
  const byRegion = new Map<string, CountyRef[]>();
  for (const c of refs) {
    if (!byRegion.has(c.region)) byRegion.set(c.region, []);
    byRegion.get(c.region)!.push(c);
  }

  return (
    <section className={s.section}>
      <div className={s.sectionInner}>
        <div className={s.kicker}>Areas we cover</div>
        <h2 className={s.sectionTitle}>{heading}</h2>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          {Array.from(byRegion.entries()).map(([region, list]) => (
            <div key={region} style={{ marginBottom: 20 }}>
              <div className={s.kicker} style={{ marginBottom: 8 }}>{region}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
                {list.map((c) => (
                  <Link key={c.slug} href={`/${vertical}/${c.slug}`}>
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
