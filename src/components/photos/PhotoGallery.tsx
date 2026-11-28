'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import s from './PhotoGallery.module.css';

export type GalleryPhoto = { url: string; alt: string };

type Props = {
  photos: GalleryPhoto[];
  /** On the thumbnail grid. */
  className?: string;
  /** On each thumbnail link. */
  itemClassName?: string;
  /** On each thumbnail image. */
  imgClassName?: string;
};

/**
 * Thumbnails that open a full-screen viewer: swipe (or arrow keys, or the
 * buttons) between a group of photos instead of opening each in a new tab.
 * The thumbnails stay links to the photo, so they still work before the
 * script loads.
 */
export function PhotoGallery({ photos, className, itemClassName, imgClassName }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  const show = (i: number) => {
    setIndex(i);
    setOpen(true);
    dialog.current?.showModal();
  };

  // Jump (not glide) to the tapped photo once the slides have a width.
  useEffect(() => {
    if (!open || !track.current) return;
    const t = track.current;
    t.scrollTo({ left: index * t.clientWidth, behavior: 'auto' });
    // Only on opening: after that the scroll position drives `index`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = useCallback((i: number) => {
    const t = track.current;
    if (!t) return;
    const n = Math.max(0, Math.min(photos.length - 1, i));
    t.scrollTo({ left: n * t.clientWidth, behavior: 'smooth' });
  }, [photos.length]);

  const onScroll = () => {
    const t = track.current;
    if (t && t.clientWidth) setIndex(Math.round(t.scrollLeft / t.clientWidth));
  };

  const close = () => dialog.current?.close();

  if (photos.length === 0) return null;
  const many = photos.length > 1;

  return (
    <>
      <div className={className}>
        {photos.map((p, i) => (
          <a
            key={p.url}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className={itemClassName}
            aria-haspopup="dialog"
            onClick={(e) => {
              // Let a modified click still open a tab.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              show(i);
            }}
          >
            {/* Signed, short-lived storage URLs: next/image would cache them past expiry. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.alt} className={imgClassName} loading="lazy" />
          </a>
        ))}
      </div>

      <dialog
        ref={dialog}
        className={s.viewer}
        aria-label="Photos"
        onClose={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
        }}
      >
        {open && (
          <>
            <div className={s.bar}>
              <span className={s.count} aria-live="polite">
                {many ? `${index + 1} of ${photos.length}` : ''}
              </span>
              <button type="button" className={s.close} onClick={close} aria-label="Close photos" autoFocus>
                ×
              </button>
            </div>
            <div ref={track} className={s.track} onScroll={onScroll}>
              {photos.map((p) => (
                // A tap beside the photo closes, as a tap on a backdrop would.
                <div key={p.url} className={s.slide} onClick={(e) => e.target === e.currentTarget && close()}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.alt} className={s.full} />
                </div>
              ))}
            </div>
            {many && (
              <>
                <button
                  type="button"
                  className={`${s.nav} ${s.prev}`}
                  onClick={() => go(index - 1)}
                  disabled={index === 0}
                  aria-label="Previous photo"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={`${s.nav} ${s.next}`}
                  onClick={() => go(index + 1)}
                  disabled={index === photos.length - 1}
                  aria-label="Next photo"
                >
                  ›
                </button>
                <div className={s.dots} aria-hidden="true">
                  {photos.map((p, i) => (
                    <span key={p.url} className={i === index ? s.dotOn : s.dot} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
