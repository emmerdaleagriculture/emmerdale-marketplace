import { InlineMd } from '@/components/InlineMd';
import type { CountyExtra } from '@/lib/countyExtras';
import s from '@/app/(frontend)/landing.module.css';

/** A hand-written per-county section (countyExtras.ts), in the county-page style. */
export function CountyExtraSection({
  section,
  alt = false,
}: {
  section: NonNullable<CountyExtra['section']>;
  alt?: boolean;
}) {
  return (
    <section className={alt ? `${s.section} ${s.sectionAlt}` : s.section}>
      <div className={s.sectionInner}>
        <div className={s.kicker}>{section.kicker}</div>
        <h2 className={s.sectionTitle}>{section.h2}</h2>
        <div className={s.sectionInner} style={{ maxWidth: 760 }}>
          {section.body.map((p) => (
            <p key={p} className={s.sectionLede}>
              <InlineMd text={p} />
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
