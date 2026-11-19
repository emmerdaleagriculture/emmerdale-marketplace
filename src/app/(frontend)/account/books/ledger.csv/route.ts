import { NextResponse, type NextRequest } from 'next/server';
import { allLines, loadBooks } from '@/lib/books/server';
import { penceToDecimal } from '@/lib/books/money';
import { isIsoDate, todayUk } from '@/lib/books/period';

import { csvRaw, csvText } from '@/lib/books/csv';

export const dynamic = 'force-dynamic';



/**
 * The general ledger as CSV (Tally's columns). Available read-only too, so a
 * lapsed member can always take their records away.
 */
export async function GET(req: NextRequest) {
  const access = await loadBooks('/account/books/ledger');
  if (!access.ledger) return new NextResponse('No books yet', { status: 404 });
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const lines = await allLines(access.ledger.id, { from: isIsoDate(from) ? from : null, to: isIsoDate(to) ? to : null });
  const header = ['Date', 'Entry ID', 'Type', 'Account code', 'Account', 'Counterparty', 'Reference', 'Description', 'Debit', 'Credit', 'VAT code', 'Receipt ID'];
  const rows = lines.map((l) =>
    [
      csvRaw(l.entry_date),
      csvRaw(l.entry_id),
      csvRaw(l.kind),
      csvRaw(l.account_code),
      csvText(l.account_name),
      csvText(l.counterparty),
      csvText(l.reference),
      csvText([l.description, l.memo].filter(Boolean).join(' · ')),
      l.debit_pence ? penceToDecimal(l.debit_pence) : '',
      l.credit_pence ? penceToDecimal(l.credit_pence) : '',
      csvRaw(l.vat_code),
      csvRaw(l.receipt_id),
    ].join(','),
  );
  const body = '﻿' + [header.join(','), ...rows].join('\r\n') + '\r\n';
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="general-ledger-${todayUk()}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
