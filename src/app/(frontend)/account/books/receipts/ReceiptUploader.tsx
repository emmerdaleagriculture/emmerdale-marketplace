'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { finishReceiptUploadAction, startReceiptUploadAction } from './actions';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/gif,image/webp';

/**
 * Pick or drop receipts. Each file goes straight to private storage on a
 * one-time signed URL, then the server checks it and starts the AI read.
 * iPhones convert HEIC photos to JPEG for an input that only accepts JPEG.
 */
export function ReceiptUploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  async function send(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    const out: string[] = [];
    const supabase = createClient();
    for (const file of files) {
      const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
      const ticket = await startReceiptUploadAction({ name: file.name, mime, size: file.size });
      if (!ticket.ok) {
        out.push(ticket.error);
        continue;
      }
      const { error } = await supabase.storage
        .from('books-receipts')
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: mime });
      if (error) {
        out.push(`${file.name} didn’t upload. Please try again.`);
        continue;
      }
      const done = await finishReceiptUploadAction({ path: ticket.path, name: file.name, mime });
      out.push(done.ok ? (done.duplicate ? `${file.name} is already in your books.` : `${file.name} uploaded, reading it now.`) : done.error);
    }
    setMessages(out);
    setBusy(false);
    if (input.current) input.current.value = '';
    router.refresh();
  }

  return (
    <div
      className={`${s.drop} ${drag ? s.dropOn : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void send(Array.from(e.dataTransfer.files));
      }}
    >
      <p>
        <b>Add receipts and invoices.</b> PDFs or photos, up to 20MB each. They’re read by AI and posted to your
        books, or put in the queue below if anything needs checking.
      </p>
      <label className={f.btnPrimary} aria-disabled={busy}>
        {busy ? 'Uploading…' : 'Choose files'}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={busy}
          hidden
          onChange={(e) => void send(Array.from(e.target.files ?? []))}
        />
      </label>
      {messages.length > 0 && (
        <ul className={s.uploadMessages} aria-live="polite">
          {messages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
