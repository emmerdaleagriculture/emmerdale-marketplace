import s from './featurePreview.module.css';

/**
 * A real screenshot of a Premium page, shown to contractors who don't have
 * it yet, so the pitch below it is about something they have seen. The
 * images are captures of Hampshire Paddock Management's own view (our test
 * account), so no other contractor's figures are on show; retake them with
 * the membership switch on /account when the page changes.
 */
export function FeaturePreview({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className={s.figure}>
      <div className={s.frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={1200} height={1742} loading="lazy" className={s.img} />
        <span className={s.badge}>Example</span>
      </div>
      <figcaption className={s.caption}>{caption}</figcaption>
    </figure>
  );
}
