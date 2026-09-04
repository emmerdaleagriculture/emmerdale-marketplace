'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Clicks drawn over the real page.
 *
 * Positions are fractions of the document, so they can be laid over the live
 * page in an iframe rather than a screenshot that goes stale the moment the
 * page changes. Same-origin, so the frame's height can be read and the whole
 * thing scaled to fit — without that the overlay would be pinned to a
 * viewport-height frame and every point below the fold would pile up at the
 * bottom edge.
 *
 * The blobs are additive: overlapping clicks brighten, which is what makes a
 * cluster read as a cluster.
 */
export function HeatOverlay({
  path,
  points,
}: {
  path: string;
  points: { x: number; y: number }[];
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(2400);
  const [blocked, setBlocked] = useState(false);
  const WIDTH = 1280;
  const SCALE = 0.42;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc) {
          setBlocked(true);
          return;
        }
        const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
        if (h > 200) setHeight(h);
      } catch {
        setBlocked(true);
      }
    };
    frame.addEventListener('load', measure);
    const t = setTimeout(measure, 1200);
    return () => {
      frame.removeEventListener('load', measure);
      clearTimeout(t);
    };
  }, [path]);

  return (
    <div
      style={{
        width: WIDTH * SCALE,
        height: height * SCALE,
        overflow: 'hidden',
        border: '1px solid var(--rule)',
        background: '#fff',
      }}
    >
      <div
        style={{
          width: WIDTH,
          height,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          position: 'relative',
        }}
      >
        <iframe
          ref={frameRef}
          src={path}
          title={`${path} preview`}
          width={WIDTH}
          height={height}
          style={{ border: 0, display: 'block', pointerEvents: 'none' }}
          scrolling="no"
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'multiply',
          }}
        >
          {points.map((p, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                width: 90,
                height: 90,
                marginLeft: -45,
                marginTop: -45,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(255,80,0,0.55) 0%, rgba(255,190,0,0.28) 45%, rgba(255,230,0,0) 70%)',
              }}
            />
          ))}
        </div>
      </div>
      {blocked && (
        <p style={{ padding: 12, fontSize: 13 }}>
          Couldn&rsquo;t measure the page height — the overlay is showing a default.
        </p>
      )}
    </div>
  );
}
