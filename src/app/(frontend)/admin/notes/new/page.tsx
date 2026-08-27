import type { Metadata } from 'next';
import Link from 'next/link';
import { NoteEditor } from '../NoteEditor';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'New note — Admin' };

export default function NewNotePage() {
  return (
    <div>
      <Link href="/admin/notes" className={s.back}>
        ← All notes
      </Link>
      <h1 className={s.h1}>New note</h1>
      <NoteEditor note={null} heroUrl={null} />
    </div>
  );
}
