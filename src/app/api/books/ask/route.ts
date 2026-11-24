import { after } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAccounts, requireAsker } from '@/lib/books/server';
import { accountingYear, todayUk } from '@/lib/books/period';
import { answerQuestion, ASK_MODEL, type AskContext, type AskEvent, type AskTurn } from '@/lib/books/askAi';
import { ensureFreeTokens, refundToken, takeToken, tokenBalance } from '@/lib/books/askTokens.server';

export const maxDuration = 300;

const MAX_QUESTION = 500;
/** A question still "running" after this long died with its request; its token goes back. */
const STALE_MS = 5 * 60 * 1000;
const PER_MINUTE = 6;

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

/**
 * Ask a question of your books and business. Takes one token, then streams
 * the answer as lines of JSON: {t:'status'|'delta'|'reset'} while it works,
 * then {t:'done', id, answer, balance} or {t:'error', message, balance}. A
 * question that fails gives its token back. The answer is finished and saved
 * even if the page is closed part-way.
 */
export async function POST(request: Request) {
  const asker = await requireAsker();
  if (!asker.ok) return json(403, { error: asker.error });

  const body = (await request.json().catch(() => null)) as { question?: unknown; context?: unknown } | null;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (question.length < 3) return json(400, { error: 'Type a question first.' });
  if (question.length > MAX_QUESTION) return json(400, { error: `Keep it under ${MAX_QUESTION} characters.` });
  const contextIds = Array.isArray(body?.context) ? body.context.filter((n): n is number => Number.isInteger(n)).slice(-3) : [];

  const admin = createServiceRoleClient();
  const { data: recent, error: recentErr } = await admin
    .from('ask_questions')
    .select('id, status, created_at')
    .eq('contractor_id', asker.userId)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('id', { ascending: false })
    .limit(50);
  if (recentErr) return json(500, { error: 'Ask isn’t working just now.' });
  const now = Date.now();
  const running = (recent ?? []).filter((q) => q.status === 'running');
  for (const q of running.filter((q) => now - new Date(q.created_at).getTime() > STALE_MS)) await refundToken(q.id, 'timed out');
  if (running.some((q) => now - new Date(q.created_at).getTime() <= STALE_MS)) {
    return json(409, { error: 'Your last question is still being answered. Give it a moment.' });
  }
  if ((recent ?? []).filter((q) => now - new Date(q.created_at).getTime() < 60_000).length >= PER_MINUTE) {
    return json(429, { error: 'That’s a lot of questions at once. Try again in a minute.' });
  }

  await ensureFreeTokens(asker.userId);
  const questionId = await takeToken(asker.userId, question);
  if (questionId === null) return json(402, { error: 'You have no tokens left.', balance: await tokenBalance(asker.userId) });

  // Earlier questions from this sitting, so "and last year?" makes sense. Only the asker's own.
  let history: AskTurn[] = [];
  if (contextIds.length) {
    const { data } = await admin
      .from('ask_questions')
      .select('id, question, answer')
      .eq('contractor_id', asker.userId)
      .eq('status', 'answered')
      .in('id', contextIds)
      .order('id');
    history = (data ?? []).flatMap((r) => (r.answer ? [{ question: r.question, answer: r.answer }] : []));
  }

  const ledger = asker.ledger;
  const today = todayUk();
  const ctx: AskContext = {
    today,
    businessName: ledger?.trading_name || ledger?.legal_name || asker.businessName,
    businessType: ledger?.business_type ?? null,
    vatRegistered: Boolean(ledger?.vat_registered),
    year: ledger ? accountingYear(ledger.year_end, today) : null,
    accounts: ledger ? (await getAccounts(ledger.id)).map((a) => ({ code: a.code, name: a.name, type: a.type })) : [],
  };

  const encoder = new TextEncoder();
  let send: (line: Record<string, unknown>) => void = () => {};
  const work = (async () => {
    const result = await answerQuestion(question, history, ctx, { contractorId: asker.userId, ledger }, (e: AskEvent) => send(e));
    const usage = { model: ASK_MODEL, tools: result.tools, input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: result.costUsd };
    if (result.answer) {
      const { error } = await admin
        .from('ask_questions')
        .update({ status: 'answered', answer: result.answer, finished_at: new Date().toISOString(), ...usage })
        .eq('id', questionId);
      if (error) console.error('[ask] answer not saved', { questionId, error: error.message });
      send({ t: 'done', id: questionId, answer: result.answer, balance: await tokenBalance(asker.userId) });
    } else {
      await refundToken(questionId, result.error ?? 'failed');
      await admin.from('ask_questions').update(usage).eq('id', questionId);
      send({ t: 'error', message: `${result.error} Your token has been given back.`, balance: await tokenBalance(asker.userId) });
    }
  })().catch(async (err) => {
    console.error('[ask] question failed', { questionId, error: err instanceof Error ? err.message : err });
    await refundToken(questionId, 'crashed');
    send({ t: 'error', message: 'Ask couldn’t answer just now. Your token has been given back.' });
  });
  // Keep going if the page is closed: the token is spent, so the answer should be there when they come back.
  after(() => work);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send = (line) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // The reader has gone; the work carries on.
        }
      };
      void work.finally(() => {
        try {
          controller.close();
        } catch {
          // Already closed by the reader.
        }
      });
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}
