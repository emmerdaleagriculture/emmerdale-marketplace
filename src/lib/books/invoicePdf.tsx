/**
 * The invoice PDF: A4, plain, with the business's details, the customer,
 * the lines, VAT and totals, how to pay, and the footer. Rendered on the
 * server with @react-pdf/renderer (no browser needed).
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatPence } from './money';
import { ukDate } from './period';
import { VAT_CODES, type VatCode } from './vat';
import type { InvoiceFull } from './invoices.server';
import type { Ledger } from './server';

const GREEN = '#1f4d2b';
const INK = '#1d1d1b';
const MUTED = '#6b6b66';
const RULE = '#dcdcd6';

const s = StyleSheet.create({
  page: { padding: 44, fontSize: 10, color: INK, fontFamily: 'Helvetica', lineHeight: 1.35 },
  top: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  business: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: GREEN, marginBottom: 4 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: GREEN, textAlign: 'right' },
  muted: { color: MUTED },
  right: { textAlign: 'right' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  label: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  table: { borderTopWidth: 1, borderTopColor: GREEN, marginBottom: 12 },
  head: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: RULE },
  row: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: RULE },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 50, textAlign: 'right' },
  cUnit: { width: 70, textAlign: 'right' },
  cVat: { width: 60, textAlign: 'right' },
  cAmt: { width: 80, textAlign: 'right' },
  th: { fontSize: 8, color: MUTED, textTransform: 'uppercase' },
  totals: { alignSelf: 'flex-end', width: 220, marginBottom: 24 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: GREEN, marginTop: 4 },
  grandText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  box: { borderWidth: 1, borderColor: RULE, borderRadius: 4, padding: 10, marginBottom: 12 },
  footer: { position: 'absolute', bottom: 30, left: 44, right: 44, fontSize: 8, color: MUTED, textAlign: 'center' },
});

const qty = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 3 });

function InvoiceDoc({ inv, ledger, payUrl }: { inv: InvoiceFull; ledger: Ledger; payUrl: string | null }) {
  const name = ledger.trading_name || ledger.legal_name;
  const due = Math.max(0, inv.gross_pence - inv.paid_pence);
  const registered = inv.lines.some((l) => l.vat_code !== 'NOVAT');
  return (
    <Document title={`Invoice ${inv.number}`} author={name}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <View style={{ maxWidth: 280 }}>
            <Text style={s.business}>{name}</Text>
            {ledger.trading_name && ledger.trading_name !== ledger.legal_name && <Text style={s.muted}>{ledger.legal_name}</Text>}
            {ledger.address && <Text style={s.muted}>{ledger.address}</Text>}
            {ledger.phone && <Text style={s.muted}>{ledger.phone}</Text>}
            {ledger.invoice_reply_to && <Text style={s.muted}>{ledger.invoice_reply_to}</Text>}
            {ledger.vat_number && <Text style={s.muted}>VAT {ledger.vat_number}</Text>}
            {ledger.company_number && <Text style={s.muted}>Company {ledger.company_number}</Text>}
          </View>
          <View>
            <Text style={s.title}>INVOICE</Text>
            <Text style={[s.right, { fontSize: 12 }]}>{inv.number}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <View style={{ maxWidth: 260 }}>
            <Text style={s.label}>Bill to</Text>
            <Text>{inv.customer.name}</Text>
            {inv.customer.organisation && <Text>{inv.customer.organisation}</Text>}
            {inv.customer.address && <Text style={s.muted}>{inv.customer.address}</Text>}
            {inv.customer.vat_number && <Text style={s.muted}>VAT {inv.customer.vat_number}</Text>}
          </View>
          <View>
            <Text style={[s.label, s.right]}>Issued</Text>
            <Text style={s.right}>{ukDate(inv.issue_date)}</Text>
            <Text style={[s.label, s.right, { marginTop: 6 }]}>Due</Text>
            <Text style={s.right}>{ukDate(inv.due_date)}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.head}>
            <Text style={[s.cDesc, s.th]}>Description</Text>
            <Text style={[s.cQty, s.th]}>Qty</Text>
            <Text style={[s.cUnit, s.th]}>Price</Text>
            {registered && <Text style={[s.cVat, s.th]}>VAT</Text>}
            <Text style={[s.cAmt, s.th]}>Amount</Text>
          </View>
          {inv.lines.map((l) => (
            <View key={l.id} style={s.row} wrap={false}>
              <Text style={s.cDesc}>{l.description}</Text>
              <Text style={s.cQty}>{qty(Number(l.quantity))}</Text>
              <Text style={s.cUnit}>{formatPence(l.unit_pence)}</Text>
              {registered && <Text style={s.cVat}>{l.vat_code === 'STD' || l.vat_code === 'RED' ? `${VAT_CODES[l.vat_code as VatCode].rate}%` : l.vat_code === 'ZERO' ? '0%' : l.vat_code === 'EXEMPT' ? 'Exempt' : '—'}</Text>}
              <Text style={s.cAmt}>{formatPence(l.net_pence)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals}>
          {registered && (
            <>
              <View style={s.totalRow}>
                <Text>Subtotal</Text>
                <Text>{formatPence(inv.net_pence)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text>VAT</Text>
                <Text>{formatPence(inv.vat_pence)}</Text>
              </View>
            </>
          )}
          <View style={s.grand}>
            <Text style={s.grandText}>Total</Text>
            <Text style={s.grandText}>{formatPence(inv.gross_pence)}</Text>
          </View>
          {inv.paid_pence > 0 && (
            <>
              <View style={s.totalRow}>
                <Text>Paid</Text>
                <Text>{formatPence(inv.paid_pence)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Due</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{formatPence(due)}</Text>
              </View>
            </>
          )}
        </View>

        {due > 0 && (ledger.bank_details || payUrl) && (
          <View style={s.box}>
            <Text style={s.label}>How to pay</Text>
            {ledger.bank_details && <Text>Bank transfer: {ledger.bank_details}</Text>}
            <Text>Please use {inv.number} as the reference.</Text>
            {payUrl && <Text style={{ marginTop: 4 }}>View or pay online: {payUrl}</Text>}
          </View>
        )}
        {inv.notes && <Text style={{ marginBottom: 12 }}>{inv.notes}</Text>}
        {!registered && <Text style={[s.muted, { fontSize: 8 }]}>Not VAT registered: no VAT is charged.</Text>}

        <Text style={s.footer} fixed>
          {ledger.invoice_footer || `${name}${ledger.company_number ? ` · Company no. ${ledger.company_number}` : ''}`}
        </Text>
      </Page>
    </Document>
  );
}

export async function invoicePdf(inv: InvoiceFull, ledger: Ledger, payUrl: string | null): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc inv={inv} ledger={ledger} payUrl={payUrl} />);
}

export function invoiceFileName(inv: { number: string }, ledger: Ledger): string {
  const who = (ledger.trading_name || ledger.legal_name).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `Invoice-${inv.number}-${who}.pdf`;
}
