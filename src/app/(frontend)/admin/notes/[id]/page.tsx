import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { noteHeroUrl } from '@/lib/notes/data';
import { NoteEditor, type EditableNote } from '../NoteEditor';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'Edit note — Admin' };

export default async function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('notes')
    .select('id, slug, title, excerpt, content_md, primary_tag, tags, hero_path, hero_alt, featured, published')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();

  const note = data as EditableNote;

  return (
    <div>
      <Link href="/admin/notes" className={s.back}>
        ← All notes
      </Link>
      <h1 className={s.h1}>Edit note</h1>
      <NoteEditor note={note} heroUrl={noteHeroUrl(note.hero_path)} />
    </div>
  );
}
