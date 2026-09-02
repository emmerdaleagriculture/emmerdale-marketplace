'use client';

import { useEffect, useRef, useState } from 'react';
import Image, { type ImageProps } from 'next/image';

/**
 * A next/image that isn't requested until it's within `rootMargin` of the
 * viewport. Native `loading="lazy"` still fetches anything within ~2500px on a
 * slow connection, which put the below-the-fold band photo on the same pipe
 * as the LCP photo (measured +0.9 s mobile LCP). The wrapper renders nothing
 * on the server, so the section relies on its own background until the image
 * arrives.
 */
export function DeferredImage({ rootMargin = '800px', ...props }: ImageProps & { rootMargin?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  // The sentinel is absolutely positioned so it doesn't affect layout inside
  // a `fill` container.
  return (
    <>
      <span ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {show && <Image {...props} />}
    </>
  );
}
