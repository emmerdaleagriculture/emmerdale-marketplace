import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ui from '../app-ui.module.css';
import { Diary } from './Diary';
import { isDay, isMonth, monthGrid, todayInLondon } from './diary';

export const metadata: Metadata = { title: 'Diary', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The Diary tab: a month calendar and a day's entries, written by the user
 * about anything (a job agreed off the phone, a service on the tractor, a
 * reminder). Entries are theirs alone (diary_entries, owner-only RLS).
 * `?m=YYYY-MM` picks the month, `?d=YYYY-MM-DD` the day; the day changes on
 * the client without a round trip. Won jobs, which this tab used to open,
 * are a row at the top for contractors and keep the tab lit (tabs.ts).
 */
export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app/diary');

  const sp = await searchParams;
  const today = todayInLondon();
  const day = sp.d && isDay(sp.d) ? sp.d : null;
  const month = sp.m && isMonth(sp.m) ? sp.m : (day ?? today).slice(0, 7);
  const grid = monthGrid(month);
  const selected = day && day.startsWith(month) ? day : today.startsWith(month) ? today : `${month}-01`;

  const [{ data: entries }, { data: contractor }] = await Promise.all([
    supabase
      .from('diary_entries')
      .select('id, entry_date, start_time, title, details, done')
      .eq('user_id', user.id)
      .gte('entry_date', grid[0].day)
      .lte('entry_date', grid[grid.length - 1].day)
      .order('entry_date')
      .order('start_time', { nullsFirst: false })
      .order('created_at')
      .limit(1000),
    supabase.from('contractors').select('id').eq('id', user.id).maybeSingle(),
  ]);

  return (
    <main className={ui.screen}>
      <h1 className={ui.title}>Diary</h1>

      {contractor && (
        <div className={ui.rows} style={{ marginBottom: 14 }}>
          <Link href="/won" className={ui.row}>
            Won jobs
            <span className={ui.rowValue}>›</span>
          </Link>
        </div>
      )}

      <Diary key={month} month={month} today={today} initialDay={selected} entries={entries ?? []} />
    </main>
  );
}
