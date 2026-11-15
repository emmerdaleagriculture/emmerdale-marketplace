/**
 * Monthly digest to ADMIN_EMAILS (via Resend, EMAIL_FROM), sent even when
 * the run found nothing: silence from a monthly job reads as a broken job.
 */

import { Resend } from 'resend';
import type { AgentRunSummary, Opportunity, OutcomeCheck } from './types';

const VERDICT: Record<OutcomeCheck['verdict'], string> = {
  improved: '▲ improved',
  flat: '– flat',
  worse: '▼ worse',
  gone: '∅ no impressions',
};

const path = (url?: string) => {
  if (!url) return '';
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function oppLine(o: Opportunity): string {
  const m = o.metrics;
  return [
    `• ${o.query} → ${path(o.targetUrl) || 'new note'}  (pos ${m.position.toFixed(1)}, ${m.impressions} impr, CTR ${(m.ctr * 100).toFixed(1)}%)${o.draftContent ? '' : '  [no draft]'}`,
    o.relatedQueries?.length ? `    + ${o.relatedQueries.map((r) => r.query).join(', ')}` : '',
    o.competingPages?.length ? `    ⚠ split with ${o.competingPages.map((p) => path(p.page)).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function composeDigest(s: AgentRunSummary, origin: string): { subject: string; text: string; html: string } {
  const open = s.opportunities.filter((o) => !o.deferred);
  const subject = open.length
    ? `SEO agent: ${open.length} opportunit${open.length === 1 ? 'y' : 'ies'} to review (${s.weekIdentified})`
    : `SEO agent: quiet month, nothing new (${s.weekIdentified})`;
  const reviewUrl = `${origin.replace(/\/+$/, '')}/admin/seo/opportunities`;

  const groups: Array<[string, Opportunity[]]> = [
    ['Title / description rewrites', s.opportunities.filter((o) => o.type === 'meta_rewrite')],
    ['On-page additions', s.opportunities.filter((o) => o.type === 'on_page_tweak')],
    ['New article drafts (unpublished notes)', s.opportunities.filter((o) => o.type === 'new_article' && !o.deferred)],
    ['Articles deferred (over the cap)', s.opportunities.filter((o) => o.deferred)],
  ];

  const lines: string[] = [];
  lines.push(
    open.length
      ? `${open.length} new opportunit${open.length === 1 ? 'y' : 'ies'} from ${s.counts.rowsFromGsc} Search Console rows (${s.gscRange.start} → ${s.gscRange.end}).`
      : `The agent ran but found nothing new in ${s.counts.rowsFromGsc} Search Console rows. Queries raised in the last 120 days are held back while their changes get recrawled, so quiet months are expected.`,
  );
  for (const [label, items] of groups) {
    if (items.length) lines.push(`\n${label} (${items.length}):\n${items.map(oppLine).join('\n')}`);
  }
  if (s.heldBack.length) {
    lines.push(`\nHeld back by the cooldown: ${s.heldBack.map((h) => `${h.query} (#${h.priorId})`).join(', ')}.`);
  }
  if (s.outcomes.length) {
    lines.push(
      `\nDid past changes work? (${s.outcomes.length})\nCompared with when each was raised. Position is the fair signal; clicks and impressions also move with the season.`,
    );
    for (const o of s.outcomes) {
      const now = o.now ? `pos ${o.now.position.toFixed(1)} · ${o.now.clicks}c/${o.now.impressions}i` : '—';
      lines.push(`  ${VERDICT[o.verdict]}  ${o.query}  (pos ${o.before.position.toFixed(1)} · ${o.before.clicks}c/${o.before.impressions}i → ${now})`);
    }
  }
  if (s.errors.length) lines.push(`\nProblems during the run:\n${s.errors.map((e) => `- ${e}`).join('\n')}`);
  lines.push(`\nReview: ${reviewUrl}`);
  lines.push(`Run ${s.runId} · Claude spend $${s.spendUsd.toFixed(2)}${s.dryRun ? ' · DRY RUN, nothing saved' : ''}`);
  const text = lines.join('\n');

  // The HTML is the same text, kept readable on a phone rather than designed.
  const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;">
<div style="max-width:640px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;">
<h1 style="margin:0 0 12px;font-size:18px;">${esc(subject)}</h1>
<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.5;margin:0;">${esc(text.replace(`\nReview: ${reviewUrl}`, ''))}</pre>
<p style="margin:24px 0 0;"><a href="${esc(reviewUrl)}" style="display:inline-block;background:#1f3a2b;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600;">Review opportunities</a></p>
</div></body></html>`;

  return { subject, text, html };
}

export async function sendDigest(s: AgentRunSummary, origin: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
  if (!apiKey || !from || !to.length) return 'digest skipped: RESEND_API_KEY / EMAIL_FROM / ADMIN_EMAILS not set';
  const { subject, text, html } = composeDigest(s, origin);
  try {
    const { error } = await new Resend(apiKey).emails.send({ from, to, subject, text, html });
    return error ? `digest send failed: ${error.message}` : null;
  } catch (err) {
    return `digest send failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
