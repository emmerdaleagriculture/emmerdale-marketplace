import { after } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAccounts, requireAsker } from '@/lib/books/server';
import { accountingYear, todayUk } from '@/lib/books/period';
import { answerQuestion, ASK_MODEL, type AskContext, type AskEvent, type AskTurn } from '@/lib/books/askAi';
import { ensureFreeTokens, refundToken, STALE_QUESTION_MS, sweepStaleQuestions, takeToken, tokenBalance } from '@/lib/books/askTokens.server';
import type { TokenBalance } from '@/lib/books/askTokens';

export const maxDuration = 300;

const MAX_QUESTION = 500;
const PER_MINUTE = 6;
/**
 * A question that ran out of room (too long an answer, too many lookups) has
 * still cost us the work. The first few a day give the token back; after that
 * they don't, so an always-failing question can't be repeated for nothing.
 */
const FREE_OVERRUNS_A_DAY = 5;

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

/** The balance for the page to show; never the reason a request fails. */
async function balanceOrNull(contractorId: string): Promise<TokenBalance | null> {
  try {
    return await tokenBalance(contractorId);
  } catch (err) {
    console.error('[ask] balance read failed', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Ask a question of your books and business. Takes one token, then streams
 * the answer as lines of JSON: {t:'status'|'delta'|'reset'} while it works,
 * then {t:'done', id, answer, balance} or {t:'error', message, balance}. A
 * question we couldn't answer gives its token back. The answer is finished
 * and saved even if the page is closed part-way.
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
  // Questions whose request died give their tokens back first, however old.
  await sweepStaleQuestions(asker.userId);
  const now = Date.now();
  const [running, lastMinute] = await Promise.all([
    admin
      .from('ask_questions')
      .select('id', { count: 'exact', head: true })
      .eq('contractor_id', asker.userId)
      .eq('status', 'running')
      .gte('created_at', new Date(now - STALE_QUESTION_MS).toISOString()),
    admin
      .from('ask_questions')
      .select('id', { count: 'exact', head: true })
      .eq('contractor_id', asker.userId)
      .gte('created_at', new Date(now - 60_000).toISOString()),
  ]);
  if (running.error || lastMinute.error) return json(500, { error: 'Ask isn’t working just now.' });
  if ((running.count ?? 0) > 0) return json(409, { error: 'Your last question is still being answered. Give it a moment.' });
  if ((lastMinute.count ?? 0) >= PER_MINUTE) return json(429, { error: 'That’s a lot of questions at once. Try again in a minute.' });

  await ensureFreeTokens(asker.userId);
  let questionId: number | null;
  try {
    questionId = await takeToken(asker.userId, question);
  } catch (err) {
    console.error('[ask] take failed', err instanceof Error ? err.message : err);
    return json(500, { error: 'Ask isn’t working just now.' });
  }
  if (questionId === null) return json(402, { error: 'You have no tokens left.', balance: await balanceOrNull(asker.userId) });
  const id = questionId;

  const encoder = new TextEncoder();
  let send: (line: Record<string, unknown>) => void = () => {};

  // From here a token is held: everything runs inside `work`, whose catch gives it back.
  const work = (async () => {
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

    const result = await answerQuestion(question, history, ctx, { contractorId: asker.userId, ledger }, (e: AskEvent) => send(e));
    const usage = { model: ASK_MODEL, tools: result.tools, input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: result.costUsd };

    if (result.answer) {
      // Only a question still running becomes answered: one already swept and refunded stays that way.
      const save = () =>
        admin
          .from('ask_questions')
          .update({ status: 'answered', answer: result.answer, finished_at: new Date().toISOString(), ...usage })
          .eq('id', id)
          .eq('status', 'running');
      let { error } = await save();
      if (error) ({ error } = await save());
      if (error) console.error('[ask] answer not saved', { questionId: id, error: error.message });
      send({ t: 'done', id, answer: result.answer, balance: await balanceOrNull(asker.userId) });
      return;
    }

    // No answer. Our fault: the token goes back. The question overran: it goes back the first few times a day.
    let giveBack = result.ours;
    if (!giveBack) {
      const { count } = await admin
        .from('ask_questions')
        .select('id', { count: 'exact', head: true })
        .eq('contractor_id', asker.userId)
        .eq('refunded', true)
        .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString());
      giveBack = (count ?? 0) < FREE_OVERRUNS_A_DAY;
    }
    if (giveBack) {
      await refundToken(id, result.error ?? 'failed');
      await admin.from('ask_questions').update(usage).eq('id', id);
    } else {
      await admin
        .from('ask_questions')
        .update({ status: 'failed', error: result.error, finished_at: new Date().toISOString(), ...usage })
        .eq('id', id)
        .eq('status', 'running');
    }
    send({
      t: 'error',
      message: `${result.error} ${giveBack ? 'Your token has been given back.' : 'This one has used a token.'}`,
      balance: await balanceOrNull(asker.userId),
    });
  })().catch(async (err) => {
    console.error('[ask] question failed', { questionId: id, error: err instanceof Error ? err.message : err });
    await refundToken(id, 'crashed');
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
