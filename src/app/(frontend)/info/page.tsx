import type { Metadata } from 'next';
import Link from 'next/link';
import { INFO_GROUPS } from '@/lib/info/topics';
import { InfoFrame } from './InfoFrame';
import { InfoIconSvg } from './InfoIcons';
import css from './info.module.css';

export const metadata: Metadata = {
  title: 'Info: Facts and Tools for Land Work',
  description:
    'Free tools for contractors and landowners: spraying windows from the forecast, weeds and what controls them, spray rates, a spray diary, fertiliser and seed rates, and the year month by month.',
  alternates: { canonical: '/info' },
};

/**
 * The Info hub: one card per topic, grouped. Topics without a page yet are
 * shown as on their way (src/lib/info/topics.ts).
 */
export default function InfoPage() {
  return (
    <InfoFrame
      eyebrow="Info"
      title={
        <>
          The facts you reach for, <em>in one place.</em>
        </>
      }
      sub="Working figures for spraying, fertilising, seeding and timing, free for anyone who works the land. Check them in the cab, not back at the yard."
    >
      {INFO_GROUPS.map((g) => (
        <section key={g.title} className={css.group}>
          <h2 className={css.groupTitle}>{g.title}</h2>
          <ul className={css.cards}>
            {g.topics.map((t) => {
              const body = (
                <>
                  <span className={css.cardIcon}>
                    <InfoIconSvg name={t.icon} />
                  </span>
                  <span className={css.cardText}>
                    <span className={css.cardTitle}>
                      {t.title}
                      {!t.href && <span className={css.soon}>Coming</span>}
                    </span>
                    <span className={css.cardBlurb}>{t.blurb}</span>
                  </span>
                  {t.href && (
                    <span className={css.cardGo} aria-hidden="true">
                      ›
                    </span>
                  )}
                </>
              );
              return (
                <li key={t.slug}>
                  {t.href ? (
                    <Link href={t.href} className={css.card}>
                      {body}
                    </Link>
                  ) : (
                    <div className={`${css.card} ${css.cardOff}`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className={css.fine}>
        These pages are a working reference, not advice for your field. The product label, and the law
        where you farm, always come first.
      </p>
    </InfoFrame>
  );
}
