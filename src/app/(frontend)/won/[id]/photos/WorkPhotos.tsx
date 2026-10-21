'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { removeWorkPhotoAction, uploadWorkPhotoAction } from './actions';
import { markDoneAction } from '../../actions';
import type { WorkPhoto } from '@/lib/sealedQuotes/workPhotos';
import { nativeCamera, pickPhoto, filesToPhotos } from '@/lib/app/photos';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import ui from '@/app/(frontend)/app/app-ui.module.css';
import s from './photos.module.css';

/**
 * On the job (PRD task 9): before photos are required, after photos unlock
 * once there is a before, and "Mark job complete" starts the customer's
 * existing sign-off only when both are there.
 */
export function WorkPhotos({ submissionId, photos, done }: { submissionId: string; photos: WorkPhoto[]; done: boolean }) {
  const [upState, upload, uploading] = useActionState(uploadWorkPhotoAction, emptyFormState);
  const [doneState, markDone, marking] = useActionState(markDoneAction, emptyFormState);
  const [pending, setPending] = useState<File | null>(null);
  const [phase, setPhase] = useState<'before' | 'after'>('before');
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  const before = photos.filter((p) => p.phase === 'before');
  const after = photos.filter((p) => p.phase === 'after');

  // A picked photo goes straight up.
  useEffect(() => {
    if (!pending || !fileRef.current || !formRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(pending);
    fileRef.current.files = dt.files;
    formRef.current.requestSubmit();
    setPending(null);
  }, [pending]);

  async function add(which: 'before' | 'after') {
    setPhase(which);
    if (nativeCamera()) {
      const file = await pickPhoto();
      if (file) setPending(file);
    } else {
      pickRef.current?.click();
    }
  }

  return (
    <>
      <form ref={formRef} action={upload} hidden>
        <input type="hidden" name="submission_id" value={submissionId} />
        <input type="hidden" name="phase" value={phase} />
        <input ref={fileRef} type="file" name="photo" />
      </form>
      <input ref={pickRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const [file] = await filesToPhotos(e.target.files); if (file) setPending(file); e.target.value = ''; }} />

      {upState.error && <p className={f.error}>{upState.error}</p>}

      <div className={s.head}>
        <h2 className={s.h2}>Before</h2>
        <span className={`${s.pill} ${before.length ? s.pillOk : s.pillReq}`}>{before.length ? `${before.length} added` : 'Required'}</span>
      </div>
      <Grid list={before} which="before" locked={false} done={done} uploading={uploading} phase={phase} add={add} />

      <div className={s.head}>
        <h2 className={s.h2}>After</h2>
        <span className={`${s.pill} ${after.length ? s.pillOk : ''}`}>{after.length ? `${after.length} added` : before.length ? 'When you finish' : 'After the before photos'}</span>
      </div>
      <Grid list={after} which="after" locked={before.length === 0} done={done} uploading={uploading} phase={phase} add={add} />

      {!done && (
        <form action={markDone}>
          <input type="hidden" name="submission_id" value={submissionId} />
          {doneState.error && <p className={f.error}>{doneState.error}</p>}
          <div className="appFooterCta">
            <button type="submit" className={`${ui.btn} ${ui.btnYellow}`} disabled={marking || before.length === 0 || after.length === 0}>
              {marking ? 'Sending…' : 'Mark job complete'}
            </button>
          </div>
        </form>
      )}
      {done && <p className={ui.note}>Marked complete. The customer has been asked to check the photos and sign off; you&rsquo;re paid once they do and their balance clears.</p>}
    </>
  );
}

/** One of the two photo grids. Module level, so a state change does not remount the images. */
function Grid({ list, which, locked, done, uploading, phase, add }: { list: WorkPhoto[]; which: 'before' | 'after'; locked: boolean; done: boolean; uploading: boolean; phase: 'before' | 'after'; add: (w: 'before' | 'after') => void }) {
  return (
    <div className={s.grid}>
      {list.map((p) => (
        <div key={p.id} className={s.shot}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={`${which} photo`} />
          {!done && (
            <form action={removeWorkPhotoAction}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className={s.remove} aria-label="Remove photo">×</button>
            </form>
          )}
        </div>
      ))}
      {!done && (
        <button type="button" className={`${s.add} ${locked ? s.addLocked : ''}`} onClick={() => add(which)} disabled={locked || uploading}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          <span>{uploading && phase === which ? 'Uploading…' : which === 'before' ? 'Before' : 'After'}</span>
        </button>
      )}
    </div>
  );
}
