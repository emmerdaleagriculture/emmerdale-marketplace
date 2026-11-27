import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RECORD_COLUMNS, recordsCsv, type SprayRecord } from '@/lib/info/sprayRecords';

export const dynamic = 'force-dynamic';

/** The signed-in user's whole spray diary as a CSV, oldest first. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  // PostgREST stops at 1,000 rows whatever is asked for, so page through.
  const rows: SprayRecord[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('spray_records')
      .select(RECORD_COLUMNS)
      .eq('user_id', user.id)
      .order('sprayed_on')
      .order('created_at')
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: 'Could not read your records.' }, { status: 500 });
    rows.push(...((data ?? []) as SprayRecord[]));
    if (!data || data.length < 1000) break;
  }
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  // A byte order mark so Excel reads the file as UTF-8.
  return new NextResponse(`﻿${recordsCsv(rows)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="spray-diary-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
