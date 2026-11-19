/**
 * Send an invoice: from "<business> via Emmerdale" on our verified domain,
 * replies to the contractor, with the PDF attached and the private link.
 * The Resend message id is kept on a 'sent' event so the delivery webhook
 * (/api/email-events) can add delivered / bounced / spam to the invoice.
 */

import { Resend } from 'resend';
import { siteUrl } from '@/lib/site';
import { formatPence } from './money';
import { ukDate } from './period';
import { invoiceFileName, invoicePdf } from './invoicePdf';
import { addEvent, type InvoiceFull } from './invoices.server';
import type { Ledger } from './server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export function invoiceLink(token: string): string {
  return `${siteUrl()}/i/${token}`;
}

const FROM_ADDRESS = () => process.env.BOOKS_INVOICE_FROM || 'invoices@emmerdaleagriculture.com';

/** Strip characters that would break or forge a From display name. */
function displayName(s: string): string {
  return s.replace(/["<>\r\n,;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export async function sendInvoiceEmail(
  inv: InvoiceFull,
  ledger: Ledger,
  replyTo: string,
): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const to = inv.customer.email?.trim();
  if (!to) return { ok: false, error: 'Add the customer’s email address first.' };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'Email isn’t set up.' };
  const name = ledger.trading_name || ledger.legal_name;
  const link = invoiceLink(inv.public_token);
  const due = Math.max(0, inv.gross_pence - inv.paid_pence);
  const pdf = await invoicePdf(inv, ledger, link);
  const greeting = inv.customer.name.split(/\s+/)[0] || 'there';
  const text = [
    `Hello ${greeting},`,
    '',
    `Here is invoice ${inv.number} from ${name} for ${formatPence(inv.gross_pence)}${due > 0 ? `, due by ${ukDate(inv.due_date)}` : ''}.`,
    '',
    `View it online: ${link}`,
    ledger.bank_details && due > 0 ? `\nTo pay by bank transfer: ${ledger.bank_details}\nPlease use ${inv.number} as the reference.` : '',
    '',
    'The invoice is attached as a PDF. If you have any questions, just reply to this email.',
    '',
    `Thank you,`,
    name,
  ]
    .filter((l) => l !== null)
    .join('\n');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1b;max-width:560px">
<p>Hello ${esc(greeting)},</p>
<p>Here is invoice <b>${esc(inv.number)}</b> from ${esc(name)} for <b>${formatPence(inv.gross_pence)}</b>${due > 0 ? `, due by ${ukDate(inv.due_date)}` : ''}.</p>
<p><a href="${link}" style="display:inline-block;background:#1f4d2b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">View invoice</a></p>
${ledger.bank_details && due > 0 ? `<p>To pay by bank transfer: ${esc(ledger.bank_details)}<br>Please use <b>${esc(inv.number)}</b> as the reference.</p>` : ''}
<p>The invoice is attached as a PDF. If you have any questions, just reply to this email.</p>
<p>Thank you,<br>${esc(name)}</p>
<p style="font-size:12px;color:#6b6b66">Sent for ${esc(name)} by Emmerdale Agriculture.</p></div>`;

  const { data, error } = await new Resend(key).emails.send({
    from: `${displayName(name)} via Emmerdale <${FROM_ADDRESS()}>`,
    to: [to],
    replyTo: replyTo,
    subject: `Invoice ${inv.number} from ${name}`,
    text,
    html,
    attachments: [{ filename: invoiceFileName(inv, ledger), content: pdf }],
    tags: [{ name: 'kind', value: 'books_invoice' }],
  });
  if (error || !data) {
    console.error('[books] invoice send failed', { invoice: inv.id, error: error?.message });
    return { ok: false, error: 'The email couldn’t be sent. Please try again.' };
  }
  await addEvent(inv.id, 'sent', { message_id: data.id, recipient: to });
  await createServiceRoleClient().from('books_invoices').update({ sent_at: new Date().toISOString(), sent_to: to }).eq('id', inv.id);
  return { ok: true, to };
}
