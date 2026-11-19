import { NextResponse, type NextRequest } from 'next/server';
import { loadBooks } from '@/lib/books/server';
import { penceToDecimal } from '@/lib/books/money';
import { isIsoDate } from '@/lib/books/period';
import { BOX_LABELS, computeReturn, type Boxes } from '@/lib/books/vatReturn';
import { vatEntries } from '@/lib/books/vat.server';

import { csvText } from '@/lib/books/csv';

export const dynamic = 'force-dynamic';


/** The VAT return as CSV: the nine boxes (summary) or every entry with its box amounts (detail). */
export async function GET(req: NextRequest) {
  const access = await loadBooks('/account/books/vat');
  const l = access.ledger;
  if (!l || !l.vat_registered) return new NextResponse('Not VAT registered', { status: 404 });
  const p = req.nextUrl.searchParams;
  const from = p.get('from');
  const to = p.get('to');
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return new NextResponse('Choose a period', { status: 400 });
  const { boxes, detail } = computeReturn(await vatEntries(l.id, from, to), {
    vat_scheme: l.vat_scheme as 'standard',
    flat_rate_percent: l.flat_rate_percent == null ? null : Number(l.flat_rate_percent),
  });
  const type = p.get('type') === 'detail' ? 'detail' : 'summary';
  let rows: string[];
  if (type === 'summary') {
    rows = [
      ['Business', 'VAT number', 'Scheme', 'Period start', 'Period end', 'Box', 'Description', 'Amount'].join(','),
      ...(Object.keys(BOX_LABELS) as unknown as (keyof Boxes)[]).map((k) =>
        [csvText(l.legal_name), csvText(l.vat_number), l.vat_scheme, from, to, String(k), csvText(BOX_LABELS[k]), penceToDecimal(boxes[k])].join(','),
      ),
    ];
  } else {
    rows = [
      ['Date', 'Entry ID', 'Type', 'VAT code', 'Counterparty', 'Description', 'Net', 'VAT', 'Gross', 'Box 1', 'Box 4', 'Box 6', 'Box 7'].join(','),
      ...detail.map(({ entry: e, boxes: b }) =>
        [
          e.entry_date,
          String(e.id),
          e.kind,
          e.vat_code,
          csvText(e.counterparty),
          csvText(e.description),
          penceToDecimal(e.net_pence),
          penceToDecimal(e.vat_pence),
          penceToDecimal(e.gross_pence),
          ...([1, 4, 6, 7] as const).map((k) => (b[k] != null ? penceToDecimal(b[k]!) : '')),
        ].join(','),
      ),
    ];
  }
  return new NextResponse('﻿' + rows.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vat-${type}-${from}-to-${to}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
