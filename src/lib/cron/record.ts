import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

/**
 * Run a scheduled handler and leave a record that it ran.
 *
 * Vercel Cron keeps no history the app can read, so until this existed the
 * only evidence that /api/cron/balances had ever fired was money moving. A
 * cron that is silently unregistered — a bad vercel.json, a plan limit, a
 * project rename — looks exactly like a quiet week, which is the failure this
 * whole session has been about.
 *
 * The row is written BEFORE the handler and stamped after, so the three
 * states are distinguishable on the admin page: finished, failed, and started
 * but never finished. The last one is the interesting one — a function killed
 * mid-run by a timeout leaves no error anywhere else.
 *
 * Recording must never be why a cron fails. If the insert does not work the
 * handler still runs, because charging a customer's balance matters more than
 * knowing that we did.
 */
export async function recordCronRun<T>(
  name: string,
  handler: () => Promise<{ result: T; detail?: Json }>,
): Promise<T> {
  const admin = createServiceRoleClient();

  let runId: string | null = null;
  try {
    const { data } = await admin
      .from('cron_runs')
      .insert({ name, started_at: new Date().toISOString() })
      .select('id')
      .maybeSingle();
    runId = data?.id ?? null;
  } catch (err) {
    console.error(`[cron:${name}] could not open a run record:`, err);
  }

  const finish = async (ok: boolean, detail?: Json, error?: string) => {
    if (!runId) return;
    try {
      await admin
        .from('cron_runs')
        .update({
          finished_at: new Date().toISOString(),
          ok,
          detail: detail ?? null,
          error: error ?? null,
        })
        .eq('id', runId);
    } catch (err) {
      console.error(`[cron:${name}] could not close the run record:`, err);
    }
  };

  try {
    const { result, detail } = await handler();
    await finish(true, detail);
    return result;
  } catch (err) {
    // Closed as failed and rethrown: the caller still decides what the HTTP
    // response is, and Sentry still sees the exception via onRequestError.
    await finish(false, undefined, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
