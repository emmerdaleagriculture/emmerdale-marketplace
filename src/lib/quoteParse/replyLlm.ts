import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/**
 * Figure extraction from contractor email replies (spec §17) — the most
 * fragile link in the chain, which is why nothing it produces goes live
 * without the contractor's one-click confirm. Same architecture as the
 * jobParse LLM layer: fast tier, forced strict tool, temperature 0, zod on
 * receipt, never throws.
 */

export const REPLY_MODEL = 'claude-haiku-4-5';
export const REPLY_PROMPT_VERSION = 'v1';

export const ReplyParseSchema = z.object({
  intent: z.enum(['quote', 'decline', 'question', 'unclear']),
  amount_pence: z.number().int().positive().nullable(),
  is_range: z.boolean(),
  range_high_pence: z.number().int().positive().nullable(),
  mentions_vat: z.boolean(),
  needs_site_visit: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type ReplyParse = z.infer<typeof ReplyParseSchema>;

const TOOL = {
  name: 'record_quote_reply',
  description: 'Record the interpretation of a contractor’s email reply to a job invitation. Always call this tool exactly once.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'intent', 'amount_pence', 'is_range', 'range_high_pence',
      'mentions_vat', 'needs_site_visit', 'confidence',
    ],
    properties: {
      intent: {
        type: 'string',
        enum: ['quote', 'decline', 'question', 'unclear'],
        description: 'quote = a figure for the work; decline = passing on the job; question = asking something; unclear = none of these.',
      },
      amount_pence: {
        type: ['integer', 'null'],
        description: 'The figure in PENCE ("450" → 45000, "£1,200" → 120000). For a range, the LOW end. Null when no figure.',
      },
      is_range: { type: 'boolean', description: '"around 4-500" is a range, not a price.' },
      range_high_pence: { type: ['integer', 'null'], description: 'High end of a range in pence, else null.' },
      mentions_vat: { type: 'boolean', description: '"+ vat", "plus VAT", "ex vat" and similar.' },
      needs_site_visit: { type: 'boolean', description: 'They want to see the site before committing.' },
      confidence: { type: 'number', description: '0..1 confidence in the reading as a firm single figure.' },
    },
  },
} as const;

const SYSTEM = `You read a contractor's email reply to a job invitation and record what it means via the record_quote_reply tool. Always call the tool exactly once.

Rules:
- Copy figures exactly as written, converted to pence. Never invent or round a figure.
- "£90/acre" or any per-unit rate is NOT a total: intent quote, amount_pence null, confidence low.
- "around 4-500" is a range: is_range true, amount_pence 40000, range_high_pence 50000.
- Ignore quoted history, signatures and legal footers — only the fresh reply matters.
- A firm single figure like "450" or "£450 + vat" deserves high confidence; anything hedged does not.`;

export type ReplyLlmResult =
  | { ok: true; parse: ReplyParse; raw: unknown }
  | { ok: false; error: string; raw?: unknown };

export async function parseReplyEmail(text: string): Promise<ReplyLlmResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'no-api-key' };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: REPLY_MODEL,
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM,
        tools: [TOOL as unknown as Anthropic.Tool],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: `Contractor's reply:\n\n${text.slice(0, 2000)}` }],
      },
      { timeout: 8000, maxRetries: 0 },
    );
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL.name,
    );
    if (!toolUse) return { ok: false, error: 'no-tool-use' };
    const parsed = ReplyParseSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      console.error('[quoteParse] reply schema mismatch:', parsed.error.issues[0]);
      return { ok: false, error: 'schema-mismatch', raw: toolUse.input };
    }
    return { ok: true, parse: parsed.data, raw: toolUse.input };
  } catch (err) {
    console.error('[quoteParse] reply parse failed:', err);
    return { ok: false, error: 'call-failed' };
  }
}

/**
 * Strip quoted history and signatures: keep only the text above the first
 * reply marker. Pure, unit-testable.
 */
export function stripReply(text: string): string {
  const markers = [
    /^On .+wrote:\s*$/m,
    /^>+/m,
    /^-{2,}\s*Original Message/im,
    /^From:\s.+$/m,
    /^Sent from my /m,
    /^--\s*$/m,
  ];
  let cut = text.length;
  for (const re of markers) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut).trim().slice(0, 2000);
}
