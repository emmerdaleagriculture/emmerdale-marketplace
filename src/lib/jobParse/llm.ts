import Anthropic from '@anthropic-ai/sdk';
import { LlmParseSchema, RECORD_JOB_PARSE_TOOL, type LlmParse } from './schema';

/**
 * The LLM extraction layer (spec §6.2). One call, forced strict tool use,
 * temperature 0. Every result is stamped with the model and prompt version so
 * the parse log (job_submission_parses) stays scoreable when either changes.
 *
 * This layer never throws: every failure — missing key, timeout, API error,
 * schema violation — collapses to { ok: false } and the caller falls through
 * to the deterministic result (§6.4).
 */

export const MODEL_VERSION = 'claude-haiku-4-5';
export const PROMPT_VERSION = 'v1';

/** Hard latency ceiling on the parse call (spec §4 step 2). */
const LLM_TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `You interpret a customer's free-text description of land, paddock or agricultural work in the UK and record it in structured form via the record_job_parse tool. Always call the tool exactly once.

The customer's wording is unconstrained — they will not use trade terms. "Chop my grass down", "cut the paddock back", "the field's got away from me" all mean Paddock topping. Interpret meaning, never keyword-match.

Services (choose exactly one, or "unmatched"):
- Paddock topping — cutting long or overgrown grass in a field or paddock back to height
- Flailing — heavy-duty flail cutting of rough vegetation, scrub, brambles or hedges
- Flail collecting — flail cutting where the cuttings are collected and removed
- Finish mowing — fine, lawn-quality mowing for a neat finish
- Harrowing — dragging harrows over grassland to level, aerate or pull out dead thatch
- Rolling — flattening or consolidating ground with a roller
- Rotavating — rotavating or tilling soil to a workable bed
- Mole ploughing — creating subsoil drainage channels with a mole plough
- Stone burying — burying stones to leave a clean seedbed
- Land & ditch clearance — clearing overgrown land, ditches or drainage channels
- Weed control — dealing with weeds such as ragwort, docks or thistles
- Spraying — applying herbicide or pesticide across a field
- Fertiliser application — spreading fertiliser
- Overseeding — re-seeding or overseeding grassland
- Manure sweeping — sweeping or collecting droppings from paddocks
- Hay, straw & haylage — supplying or delivering hay, straw or haylage bales
- Tractor hire (events) — hiring a tractor (with driver) for an event or show

Rules:
- "unmatched" is a legitimate, first-class answer. Prefer it over a poor fit — a wrong confident classification is worse than an honest unmatched.
- service_verbatim: copy the customer's own words for the work, unaltered.
- service_alternatives: the next-best candidates (up to 3, best first) — even when confident, include plausible neighbours; empty only when nothing else is remotely plausible.
- Copy numbers and dates exactly as written; never infer a quantity that is not stated. Use null for anything not mentioned.
- Set field_confidence to 0 for absent fields.`;

export type LlmCallResult =
  | { ok: true; parse: LlmParse; raw: unknown; latencyMs: number }
  | { ok: false; error: string; raw?: unknown; latencyMs: number };

export async function callParseModel(
  rawText: string,
  locationRaw: string,
  now: Date,
): Promise<LlmCallResult> {
  const started = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[jobParse] ANTHROPIC_API_KEY not set — deterministic fallback only');
    return { ok: false, error: 'no-api-key', latencyMs: 0 };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: MODEL_VERSION,
        max_tokens: 1500,
        temperature: 0,
        system: SYSTEM_PROMPT,
        // The strict schema is authoritative; the SDK's Tool type doesn't
        // model the readonly literal, hence the cast.
        tools: [RECORD_JOB_PARSE_TOOL as unknown as Anthropic.Tool],
        tool_choice: { type: 'tool', name: RECORD_JOB_PARSE_TOOL.name },
        messages: [
          {
            role: 'user',
            content:
              `Today's date: ${now.toISOString().slice(0, 10)}\n` +
              `Location given: ${locationRaw.trim() || '(none)'}\n\n` +
              `Customer's description:\n${rawText}`,
          },
        ],
      },
      { timeout: LLM_TIMEOUT_MS, maxRetries: 0 },
    );

    const latencyMs = Date.now() - started;
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === RECORD_JOB_PARSE_TOOL.name,
    );
    if (!toolUse) {
      console.error('[jobParse] no tool_use block in response', response.stop_reason);
      return { ok: false, error: 'no-tool-use', raw: response.content, latencyMs };
    }

    const parsed = LlmParseSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      // A strict-schema violation is a prompt/schema bug, never a value to
      // store (§6.2). Log the full payload so the bug is diagnosable.
      console.error(
        '[jobParse] model output failed schema validation:',
        parsed.error.issues[0],
        JSON.stringify(toolUse.input),
      );
      return { ok: false, error: 'schema-mismatch', raw: toolUse.input, latencyMs };
    }

    return { ok: true, parse: parsed.data, raw: toolUse.input, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return { ok: false, error: 'timeout', latencyMs };
    }
    if (err instanceof Anthropic.APIError) {
      console.error('[jobParse] API error:', err.status, err.message);
      return { ok: false, error: `api-${err.status ?? 'error'}`, latencyMs };
    }
    console.error('[jobParse] parse call failed:', err);
    return { ok: false, error: 'unknown', latencyMs };
  }
}
