/**
 * Statement rows from payees the books haven't seen before: one request to
 * Claude with the rows and the chart of accounts, an account and VAT code
 * back for each. What comes back is only ever a guess: the rows post flagged
 * to check. Never throws; on any failure the caller falls back to 4900/6990.
 */

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { RECEIPT_MODEL } from './receiptAi';
import type { AccountType } from './chart';

const Schema = z.object({
  rows: z.array(
    z.object({
      n: z.number().int().describe('The row number given'),
      account: z.string().describe('Account code from the chart'),
      vat: z.enum(['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE']),
    }),
  ),
});

export type AiRow = { n: number; date: string; payee: string; description: string; type: string | null; amount: number };
export type AiPick = { account: string; vat: 'STD' | 'RED' | 'ZERO' | 'EXEMPT' | 'OUTSIDE' };

const SYSTEM = `You are the bookkeeper for a small UK land-based business (contractor, farm, paddock services). You are given bank statement rows the books have no history for, and the chart of accounts. For each row choose the most likely account and VAT treatment.
- Money out to a supplier: an expense account, or a fixed asset account for equipment or vehicles over about £500.
- Money in from a customer: an income account.
- Transfers between the owner and the business, loans, tax payments to HMRC: the matching balance-sheet account if the chart has one.
- VAT: STD for most UK purchases from VAT-registered businesses; ZERO for most food, books and children's clothes; EXEMPT for insurance, bank charges, postage stamps and most rent; OUTSIDE for wages, payments to individuals, HMRC, transfers, and suppliers outside the UK (software subscriptions billed from abroad). RED for domestic fuel and power.
- Use only account codes from the chart. Answer for every row number given.`;

export async function categoriseRows(
  rows: AiRow[],
  ctx: { businessName: string; businessType: string; vatRegistered: boolean; accounts: { code: string; name: string; type: AccountType; description: string | null }[] },
): Promise<Map<number, AiPick>> {
  const out = new Map<number, AiPick>();
  if (!rows.length || !process.env.ANTHROPIC_API_KEY) return out;
  const chart = ctx.accounts
    .filter((a) => !['1100', '1200', '1210', '1220', '2201', '2202'].includes(a.code))
    .map((a) => `${a.code} ${a.name} (${a.type})${a.description ? ` - ${a.description}` : ''}`)
    .join('\n');
  const list = rows
    .map((r) => `${r.n}. ${r.date} | ${r.payee}${r.description ? ` | ${r.description}` : ''}${r.type ? ` | ${r.type}` : ''} | ${r.amount > 0 ? 'in' : 'out'} £${(Math.abs(r.amount) / 100).toFixed(2)}`)
    .join('\n');
  const text = [
    `Business: ${ctx.businessName} (${ctx.businessType.replace('_', ' ')}), ${ctx.vatRegistered ? 'VAT registered' : 'not VAT registered'}.`,
    '',
    'Chart of accounts:',
    chart,
    '',
    'Rows:',
    list,
  ].join('\n');
  try {
    const res = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).beta.messages.parse(
      {
        model: RECEIPT_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: text }],
        output_config: { effort: 'low', format: betaZodOutputFormat(Schema) },
      },
      { timeout: 90_000, maxRetries: 1 },
    );
    const parsed = res.parsed_output as z.infer<typeof Schema> | null;
    for (const r of parsed?.rows ?? []) out.set(r.n, { account: r.account, vat: r.vat });
  } catch (err) {
    console.error('[books] bank row categorise failed:', err instanceof Error ? err.message : err);
  }
  return out;
}
