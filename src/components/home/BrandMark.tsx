import Image from 'next/image';

/**
 * The EA mark: the E and A with the field rows running through them, cut
 * from the logo (public/images/brand). White, for the green and ink bars it
 * sits in; the colour versions are beside it for anything on a light ground.
 * `size` is the height; the width follows the artwork's 511×250.
 */
export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/images/brand/ea-mark-white.png"
      alt=""
      width={Math.round((size * 511) / 250)}
      height={size}
      className={className}
      priority
    />
  );
}

/** The full logo — mark over EMMERDALE AGRICULTURE — in white. `width` in px. */
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
