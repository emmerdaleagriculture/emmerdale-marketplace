import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadLedger } from '@/lib/books/server';
import { RECEIPTS_BUCKET } from '@/lib/books/receipts.server';
import { storedDocuments } from '@/lib/books/filing.server';

export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/xhtml+xml': 'xhtml',
  'text/html': 'html',
};

/** A filed document kept with the books (owner or a viewer of the books). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await params;
  const access = await loadLedger('/account/books/year-end');
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Not found', { status: 404 });
  const admin = createServiceRoleClient();
  const { data: filing } = await admin.from('books_filings').select('id, kind, period_end, documents').eq('id', id).eq('ledger_id', access.ledger.id).maybeSingle();
  const doc = filing ? storedDocuments(filing).find((d) => d.type === type) : undefined;
  if (!filing || !doc) return new NextResponse('Not found', { status: 404 });
  const { data: blob, error } = await admin.storage.from(RECEIPTS_BUCKET).download(doc.path);
  if (error || !blob) return new NextResponse('Not found', { status: 404 });
  const ext = EXT[doc.contentType] ?? 'bin';
  return new NextResponse(blob, {
    headers: {
      // Served as a download, never rendered on our origin (an iXBRL file is HTML).
      'Content-Type': doc.contentType === 'application/pdf' ? 'application/pdf' : 'application/octet-stream',
      'Content-Disposition': `${doc.contentType === 'application/pdf' ? 'inline' : 'attachment'}; filename="${filing.kind}-${filing.period_end}-${doc.type}.${ext}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
