import Image from 'next/image';

/**
 * The logo — the EA mark over EMMERDALE AGRICULTURE — in white, for the green
 * and ink bars it sits in (public/images/brand; the colour versions are
 * beside it for anything on a light ground). `width` is the intrinsic size
 * in px; the bars set the height in CSS.
 */
export function BrandLockup({
  width = 200,
  className,
  priority = false,
  sizes,
}: {
  width?: number;
  className?: string;
  /** In the header, above the fold on every page: load it first. */
  priority?: boolean;
  /** The rendered width, when CSS sets it: without this the srcset stops
   *  at 2× `width`, and a 3× phone gets a soft logo. */
  sizes?: string;
}) {
  return (
    <Image
      src="/images/brand/ea-lockup-white.png"
      alt="Emmerdale Agriculture"
      width={width}
      height={Math.round((width * 414) / 838)}
      className={className}
      priority={priority}
      sizes={sizes}
    />
  );
}
