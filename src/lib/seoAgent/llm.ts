/**
 * Claude calls for the SEO agent, with a per-run spend cap.
 *
 *   Haiku 5.5  per-query intent classifier (cheap; dozens per run)
 *   Opus 5.5   drafts (a handful per run)
 *
 * Both use structured outputs (output_config.format from a zod schema), so a
 * draft is schema-valid or the call returns null; there is no hand-parsing of
 * fenced JSON. Opus runs with the server-side refusal fallback ("default"
 * routing); Haiku 5.5 has none. Every failure (missing key, timeout, refusal,
 * schema miss) returns null, and the caller persists the opportunity without
 * a draft so it is still seen.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type * as z from 'zod/v4';

export const CLASSIFIER_MODEL = 'claude-haiku-5-5';
export const DRAFT_MODEL = 'claude-opus-5-5';

/** USD per million tokens (input, output). Haiku 5.5's rate is for prompts under 100K. */
const PRICE_PER_M: Record<string, { input: number; output: number }> = {
  [CLASSIFIER_MODEL]: { input: 0.1, output: 0.5 },
  [DRAFT_MODEL]: { input: 4, output: 20 },
};

/**
 * Per-run limits: Claude spend, and wall clock. stopAt is when every call
 * must have returned so the run can persist and record itself inside the
 * function's 300s; draft timeouts are clamped to it.
 */
export class SpendBudget {
  private spent = 0;
  constructor(
    private readonly capUsd = 2.5,
    private readonly stopAt = Number.POSITIVE_INFINITY,
  ) {}
  msLeft() {
    return this.stopAt - Date.now();
  }
  add(model: string, usage: { input_tokens: number; output_tokens: number }) {
    // A fallback can answer on another model; price unknowns at the draft rate.
    const p = PRICE_PER_M[model] ?? PRICE_PER_M[DRAFT_MODEL];
    this.spent += (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000;
  }
  exceeded() {
    return this.spent >= this.capUsd;
  }
  spentUsd() {
    return this.spent;
  }
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  client ??= new Anthropic({ maxRetries: 1 });
  return client;
}

/** Classifier call: Haiku 5.5, low effort, schema-checked output. */
export async function classifyJson<S extends z.ZodType>(args: {
  system: string;
  user: string;
  schema: S;
  budget: SpendBudget;
}): Promise<z.infer<S> | null> {
  try {
    const res = await anthropic().messages.parse(
      {
        model: CLASSIFIER_MODEL,
        max_tokens: 4000,
        system: [{ type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: args.user }],
        output_config: { effort: 'low', format: zodOutputFormat(args.schema) },
      },
      { timeout: 45_000 },
    );
    args.budget.add(res.model, res.usage);
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
    return (res.parsed_output as z.infer<S> | null) ?? null;
  } catch (err) {
    console.error('[seo-agent] classify call failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Draft call: Opus 5.5, medium effort, refusal fallback on, schema-checked output. */
export async function draftJson<S extends z.ZodType>(args: {
  system: string;
  user: string;
  schema: S;
  budget: SpendBudget;
}): Promise<z.infer<S> | null> {
  // No retry, and never past the run's stop time: a 120s call retried once
  // could outlive the function and lose the run record.
  const timeout = Math.min(120_000, args.budget.msLeft());
  if (timeout < 20_000) return null;
  try {
    const res = await anthropic().beta.messages.parse(
      {
        model: DRAFT_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: args.user }],
        output_config: { effort: 'medium', format: betaZodOutputFormat(args.schema) },
      },
      { timeout, maxRetries: 0 },
    );
    args.budget.add(res.model, res.usage);
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
    return (res.parsed_output as z.infer<S> | null) ?? null;
  } catch (err) {
    console.error('[seo-agent] draft call failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
