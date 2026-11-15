import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordCronRun } from '@/lib/cron/record';
import { cronAuthorised } from '@/lib/cronAuth';
import { siteUrl } from '@/lib/site';
import { runAgent } from '@/lib/seoAgent/orchestrate';
import { sendDigest } from '@/lib/seoAgent/digest';
import type { Json } from '@/lib/database.types';

/**
 * /api/cron/seo-agent — the monthly Search Console review (src/lib/seoAgent).
 *
 * GET  — Vercel cron, 07:00 UTC on the 1st: raise opportunities with Claude
 *        drafts into seo_opportunities, put article drafts in /admin/notes as
 *        unpublished notes, and email the digest to ADMIN_EMAILS.
 * POST — manual run. ?dryRun=1 classifies and drafts (spending Claude credit)
 *        but writes nothing and sends no email unless &email=1.
 *
 * Both require the cron secret. Review at /admin/seo/opportunities.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(dryRun: boolean, email: boolean) {
  const summary = await recordCronRun('seo-agent', async () => {
    const s = await runAgent(createServiceRoleClient(), { dryRun });
    if (s.counts.rowsFromGsc === 0 && s.errors.length) throw new Error(s.errors.slice(0, 3).join(' | '));
    if (email) {
      const problem = await sendDigest(s, siteUrl());
      if (problem) s.errors.push(problem);
    }
    const detail = {
      runId: s.runId,
      dryRun: s.dryRun,
      counts: s.counts,
      spendUsd: Number(s.spendUsd.toFixed(3)),
      errors: s.errors.slice(0, 30),
    };
    return { result: s, detail: detail as unknown as Json };
  });
  return NextResponse.json(summary);
}

export async function GET(request: Request) {
  if (!cronAuthorised(request)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  return handle(false, true);
}

export async function POST(request: Request) {
  if (!cronAuthorised(request)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const q = new URL(request.url).searchParams;
  const dryRun = q.get('dryRun') === '1';
  return handle(dryRun, !dryRun || q.get('email') === '1');
}
