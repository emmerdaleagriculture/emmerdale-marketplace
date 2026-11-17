import Image, { type StaticImageData } from 'next/image';
import s from './featurePreview.module.css';

/**
 * A real screenshot of a Premium page, shown to contractors who don't have
 * it yet, so the pitch below it is about something they have seen. The
 * captures are Hampshire Paddock Management's own view (our test account),
 * cropped so they show what the page is like without giving away the paid
 * part (market data stops before the price table). Retake them with the
 * membership switch on /account when the page changes.
 */
export function FeaturePreview({ image, alt, caption }: { image: StaticImageData; alt: string; caption: string }) {
  return (
    <figure className={s.figure}>
      <div className={s.frame}>
        <Image src={image} alt={alt} sizes="(max-width: 800px) 100vw, 760px" className={s.img} />
      </div>
      <figcaption className={s.caption}>
        <span className={s.badge}>Example</span> {caption}
      </figcaption>
    </figure>
  );
}
