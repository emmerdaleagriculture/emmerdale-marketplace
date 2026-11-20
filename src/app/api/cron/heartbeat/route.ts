import { NextResponse, type NextRequest } from 'next/server';
import { recordCronRun } from '@/lib/cron/record';
import { cronAuthorised } from '@/lib/cronAuth';
import { runHeartbeat } from '@/lib/heartbeat/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** GET|POST /api/cron/heartbeat: every check in src/lib/heartbeat/checks.ts, every 15 minutes. */
async function handle(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const out = await recordCronRun('heartbeat', async () => {
    const r = await runHeartbeat();
    return { result: r, detail: { checks: r.checks, failing: r.failing } };
  });
  return NextResponse.json(out);
}

export const GET = handle;
export const POST = handle;
