'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { downscalePhoto } from '@/lib/photoDownscale';
import type { WeedIdAnswer } from '@/lib/info/weedId';
import css from './weeds.module.css';

/**
 * Photograph a weed and have it named (Pro and Premium members). The page
 * is static, so whether the viewer may use this is asked of the API once
 * the page is up; everyone else sees what it is and who it is for.
 */
type Access = { can: true; left: number } | { can: false; reason: 'signed-out' | 'not-member' | 'used-up' } | null;

export function WeedPhoto({ names }: { names: Record<string, string> }) {
  const [access, setAccess] = useState<Access>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<WeedIdAnswer | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/info/weed-id', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => setAccess(a ?? { can: false, reason: 'signed-out' }))
      .catch(() => setAccess({ can: false, reason: 'signed-out' }));
  }, []);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    setAnswer(null);
    setPreview(URL.createObjectURL(file));
    try {
      const small = await downscalePhoto(file, 1280);
      const body = new FormData();
      body.set('photo', small);
      const r = await fetch('/api/info/weed-id', { method: 'POST', body, credentials: 'same-origin' });
      const j = (await r.json().catch(() => null)) as { answer?: WeedIdAnswer; left?: number; error?: string } | null;
      if (!r.ok || !j?.answer) setError(j?.error ?? 'The photo couldn’t be read. Try again.');
      else {
        setAnswer(j.answer);
        if (typeof j.left === 'number') setAccess(j.left > 0 ? { can: true, left: j.left } : { can: false, reason: 'used-up' });
      }
    } catch {
      setError('The photo didn’t send. Check your signal and try again.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const sure = answer ? (answer.confidence >= 0.8 ? 'Fairly sure' : answer.confidence >= 0.55 ? 'Probably' : 'Not sure') : '';

  return (
    <section className={css.photo}>
      <h2 className={css.photoTitle}>
        Photograph it <span className={css.members}>Pro and Premium</span>
      </h2>
      {access === null ? (
        <p className={css.photoText}>Checking your account…</p>
      ) : access.can || busy || answer ? (
        <>
          <p className={css.photoText}>One plant, close enough to see the leaf, in focus. A flower or seed head helps most.</p>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void send(f);
            }}
          />
          <button type="button" className={css.photoBtn} disabled={busy || !access.can} onClick={() => input.current?.click()}>
            {busy ? 'Looking…' : answer ? 'Try another photo' : 'Take or choose a photo'}
          </button>
          {access.can && <span className={css.left}>{access.left} left today</span>}
        </>
      ) : access.reason === 'used-up' ? (
        <p className={css.photoText}>That is today’s photos used. More tomorrow; the list below works meanwhile.</p>
      ) : (
        <>
          <p className={css.photoText}>
            Members on Pro or Premium can photograph a weed and have it named, then go straight to what controls it. Everyone can pick from the list below.
          </p>
          {access.reason === 'signed-out' ? (
            <Link href="/login?next=/info/weeds" className={css.photoLink}>
              Sign in
            </Link>
          ) : (
            <Link href="/account/membership" className={css.photoLink} data-app-hide>
              See membership
            </Link>
          )}
        </>
      )}

      {(preview || error || answer) && (
        <div className={css.answer}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the photo just taken */}
          {preview && <img src={preview} alt="The photo you took" className={css.thumb} />}
          <div className={css.answerText}>
            {busy && <p className={css.photoText}>Looking at your photo…</p>}
            {error && (
              <p className={css.error} role="alert">
                {error}
              </p>
            )}
            {answer && (
              <div role="status">
                {answer.name ? (
                  <>
                    <div className={css.answerSure}>{sure}</div>
                    <div className={css.answerName}>
                      {answer.name}
                      {answer.latin && <em> {answer.latin}</em>}
                    </div>
                  </>
                ) : (
                  <div className={css.answerName}>No plant could be made out</div>
                )}
                <p className={css.photoText}>{answer.why}</p>
                {answer.slug ? (
                  <Link href={`/info/weeds/${answer.slug}`} className={css.photoBtn}>
                    How to control {names[answer.slug]?.toLowerCase() ?? 'it'}
                  </Link>
                ) : (
                  answer.name && <p className={css.photoText}>We hold no treatment notes for this one yet.</p>
                )}
                {answer.alternatives.length > 0 && (
                  <p className={css.photoText}>
                    It could also be{' '}
                    {answer.alternatives.map((s, i) => (
                      <span key={s}>
                        {i > 0 && (i === answer.alternatives.length - 1 ? ' or ' : ', ')}
                        <Link href={`/info/weeds/${s}`}>{names[s]?.toLowerCase() ?? s}</Link>
                      </span>
                    ))}
                    .
                  </p>
                )}
                <p className={css.caveat}>A photo identification is a pointer, not a certainty. Be sure of the weed before you choose a product.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
