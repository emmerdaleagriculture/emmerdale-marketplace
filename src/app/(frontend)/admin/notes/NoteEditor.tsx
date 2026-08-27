'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { saveNoteAction, deleteNoteAction } from './actions';
import { CURATED_TAGS } from '@/lib/notes/tags';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../admin.module.css';

const EMPTY: FormState = {};

export type EditableNote = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_md: string;
  primary_tag: string | null;
  tags: string[];
  hero_path: string | null;
  hero_alt: string | null;
  featured: boolean;
  published: boolean;
};

/** Shared create/edit form for a note. */
export function NoteEditor({ note, heroUrl }: { note: EditableNote | null; heroUrl: string | null }) {
  const [state, action, pending] = useActionState(saveNoteAction, EMPTY);
  const [delState, delAction, delPending] = useActionState(deleteNoteAction, EMPTY);

  return (
    <div style={{ maxWidth: 860 }}>
      <form action={action}>
        {note && <input type="hidden" name="id" value={note.id} />}

        {state.error && <p className={f.error}>{state.error}</p>}
        {state.ok && state.message && <p className={f.success}>{state.message}</p>}

        <label className={f.field}>
          <span className={f.label}>Title</span>
          <input className={f.input} type="text" name="title" required defaultValue={note?.title} />
        </label>

        <label className={f.field}>
          <span className={f.label}>Slug</span>
          <input
            className={f.input}
            type="text"
            name="slug"
            defaultValue={note?.slug}
            placeholder="left blank = derived from the title"
          />
          {note?.published && (
            <span className={f.hint}>
              Changing the slug of a published post breaks its existing URL — Google and any shared
              links will 404.
            </span>
          )}
        </label>

        <label className={f.field}>
          <span className={f.label}>Excerpt</span>
          <textarea
            className={f.textarea}
            name="excerpt"
            rows={2}
            maxLength={300}
            defaultValue={note?.excerpt ?? ''}
          />
          <span className={f.hint}>Shown on the cards and used as the meta description.</span>
        </label>

        <label className={f.field}>
          <span className={f.label}>Body (Markdown)</span>
          <textarea
            className={f.textarea}
            name="content_md"
            rows={24}
            defaultValue={note?.content_md ?? ''}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.6 }}
          />
          <span className={f.hint}>
            Standard Markdown: ## headings, **bold**, lists, &gt; quotes, images by URL.
          </span>
        </label>

        <div className={f.field}>
          <span className={f.label}>Tags</span>
          <div className={f.chips}>
            {CURATED_TAGS.map((t) => (
              <label
                key={t.slug}
                className={`${f.chip} ${note?.tags.includes(t.slug) ? f.chipOn : ''}`}
              >
                <input type="checkbox" name="tags" value={t.slug} defaultChecked={note?.tags.includes(t.slug)} />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        <label className={f.field}>
          <span className={f.label}>Primary tag</span>
          <select className={f.input} name="primary_tag" defaultValue={note?.primary_tag ?? ''}>
            <option value="">(first ticked tag)</option>
            {CURATED_TAGS.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
          <span className={f.hint}>Drives the card pill, breadcrumb and end-of-post CTA.</span>
        </label>

        <label className={f.field}>
          <span className={f.label}>Hero image {heroUrl ? '(replace)' : ''}</span>
          {heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroUrl}
              alt=""
              style={{ maxWidth: 320, display: 'block', marginBottom: 8, borderRadius: 2 }}
            />
          )}
          <input className={f.input} type="file" name="hero" accept="image/*" />
        </label>

        <label className={f.field}>
          <span className={f.label}>Hero alt text</span>
          <input className={f.input} type="text" name="hero_alt" defaultValue={note?.hero_alt ?? ''} />
        </label>

        <label className={f.checkRow}>
          <input type="checkbox" name="featured" defaultChecked={note?.featured} />
          Featured — pinned to the top of /notes (newest featured post wins)
        </label>

        <label className={f.checkRow}>
          <input type="checkbox" name="published" defaultChecked={note?.published} />
          Published — visible on the site
        </label>

        <div className={s.actions}>
          <button className={f.btnPrimary} type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          {note?.published && (
            <Link href={`/notes/${note.slug}`} className={f.btnGhost}>
              View live →
            </Link>
          )}
        </div>
      </form>

      {note && (
        <form
          action={delAction}
          style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--rule)' }}
          onSubmit={(e) => {
            if (!confirm('Delete this note permanently? This can’t be undone.')) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={note.id} />
          {delState.error && <p className={f.error}>{delState.error}</p>}
          <button className={f.btnDanger} type="submit" disabled={delPending}>
            {delPending ? 'Deleting…' : 'Delete note'}
          </button>
        </form>
      )}
    </div>
  );
}
