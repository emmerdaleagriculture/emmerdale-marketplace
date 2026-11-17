'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { ContractorAvatar } from '@/components/ContractorAvatar';
import { downscalePhoto } from '@/lib/photoDownscale';
import { removeAvatarAction, uploadAvatarAction, type AvatarState } from '../avatarActions';
import f from '@/components/forms/forms.module.css';
import s from './avatarUpload.module.css';

const EMPTY: AvatarState = {};

/**
 * Profile picture on the settings page. Picking a file uploads it straight
 * away (no separate save): shrunk on the phone first so a 6MB camera photo
 * is ~300KB on rural signal, then squared and re-encoded on the server.
 */
export function AvatarUpload({ url, name }: { url: string | null; name: string }) {
  const [state, upload, uploading] = useActionState(uploadAvatarAction, EMPTY);
  const [removing, startRemove] = useTransition();
  const [, startUpload] = useTransition();
  const [preparing, setPreparing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = uploading || removing || preparing;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreparing(true);
    const small = await downscalePhoto(file, 1200);
    setPreparing(false);
    const fd = new FormData();
    fd.set('avatar', small);
    startUpload(() => upload(fd));
  }

  return (
    <section className={s.wrap} aria-label="Profile picture">
      <ContractorAvatar url={url} name={name} size={72} />
      <div className={s.body}>
        <strong className={s.title}>Profile picture</strong>
        <span className={f.hint}>
          Your logo or a photo. Customers see it beside your prices, and it shows on your
          listing.
        </span>
        <div className={s.buttons}>
          <button type="button" className={f.chip} disabled={busy} onClick={() => inputRef.current?.click()}>
            {uploading || preparing ? 'Uploading…' : url ? 'Change picture' : 'Upload a picture'}
          </button>
          {url && (
            <button
              type="button"
              className={s.remove}
              disabled={busy}
              onClick={() => startRemove(() => removeAvatarAction())}
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
        {state.error && <p className={f.error}>{state.error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onPick}
        />
      </div>
    </section>
  );
}
