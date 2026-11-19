import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Count a customer opening their invoice link: not when the contractor who
 * owns it is signed in, and repeat opens within 30 minutes count once.
 */
export async function recordInvoiceView(inv: { id: number; ledger_id: string; viewed_at: string | null }, ownerId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id === ownerId) return;
    const admin = createServiceRoleClient();
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: recent } = await admin
      .from('books_invoice_events')
      .select('id')
      .eq('invoice_id', inv.id)
      .eq('kind', 'viewed')
      .gte('at', since)
      .limit(1);
    if (recent?.length) return;
    await admin.from('books_invoice_events').insert({ invoice_id: inv.id, kind: 'viewed' });
    if (!inv.viewed_at) await admin.from('books_invoices').update({ viewed_at: new Date().toISOString() }).eq('id', inv.id);
  } catch (err) {
    console.error('[books] invoice view not recorded', err instanceof Error ? err.message : err);
  }
}
