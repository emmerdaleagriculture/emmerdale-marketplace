import { after } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAccounts, requireAsker } from '@/lib/books/server';
import { accountingYear, todayUk } from '@/lib/books/period';
import { answerQuestion, ASK_MODEL, type AskContext, type AskEvent, type AskTurn } from '@/lib/books/askAi';
import { ensureFreeTokens, refundToken, STALE_QUESTION_MS, sweepStaleQuestions, takeToken, tokenBalance } from '@/lib/books/askTokens.server';
import type { TokenBalance } from '@/lib/books/askTokens';
import { actionNote, WITHDRAW_TOOL, type AskActionView } from '@/lib/books/askActions';
import { actionsFor, proposeAction, withdrawAction } from '@/lib/books/askActions.server';

export const maxDuration = 300;

const MAX_QUESTION = 500;
/** Earlier turns of a conversation sent along with a follow-up. */
const MAX_HISTORY = 6;
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
 * Ask a question of your books and business, or ask for something to be done
 * in the books. Takes one token, then streams the answer as lines of JSON:
 * {t:'status'|'delta'|'reset'} while it works, then {t:'done', id, answer,
 * actions, withdrawn, balance} or {t:'error', message, balance}. `actions` are
 * changes prepared for the member to confirm (nothing is written here) and
 * `withdrawn` the ids of earlier ones it took back. `follow` is
 * the id of an earlier answer this question continues: that conversation is
 * sent along so "and last year?" makes sense. A question we couldn't answer
 * gives its token back. The answer is finished and saved even if the page is
 * closed part-way.
 */
export async function POST(request: Request) {
  const asker = await requireAsker();
  if (!asker.ok) return json(403, { error: asker.error });

  const body = (await request.json().catch(() => null)) as { question?: unknown; follow?: unknown } | null;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  const follow = typeof body?.follow === 'number' && Number.isSafeInteger(body.follow) && body.follow > 0 ? body.follow : null;
  // A follow-up can be as short as "ok" or "no".
  if (question.length < (follow ? 2 : 3)) return json(400, { error: 'Type a question first.' });
  if (question.length > MAX_QUESTION) return json(400, { error: `Keep it under ${MAX_QUESTION} characters.` });

  const admin = createServiceRoleClient();
  // A follow-up continues one of the asker's own answered questions; its conversation is named by the first question in it.
  let threadId: number | null = null;
  if (follow) {
    const { data: parent, error } = await admin
      .from('ask_questions')
      .select('id, thread_id')
      .eq('id', follow)
      .eq('contractor_id', asker.userId)
      .eq('status', 'answered')
      .maybeSingle();
    if (error) return json(500, { error: 'Ask isn’t working just now.' });
    if (!parent) return json(400, { error: 'That answer can’t be followed up. Ask it as a new question.' });
    threadId = parent.thread_id ?? parent.id;
  }
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
  if (threadId) {
    const { error } = await admin.from('ask_questions').update({ thread_id: threadId }).eq('id', id);
    if (error) console.error('[ask] thread not set', { questionId: id, error: error.message });
  }

  const encoder = new TextEncoder();
  let send: (line: Record<string, unknown>) => void = () => {};

  // From here a token is held: everything runs inside `work`, whose catch gives it back.
  const work = (async () => {
    // The conversation so far (the asker's own, answered turns only), with what became of any changes prepared in it.
    let history: AskTurn[] = [];
    let earlierChanges: string[] = [];
    // Changes prepared in this conversation: the only ones this answer may take back.
    const inConversation = new Set<number>();
    if (threadId) {
      const { data } = await admin
        .from('ask_questions')
        .select('id, question, answer')
        .eq('contractor_id', asker.userId)
        .eq('status', 'answered')
        .or(`id.eq.${threadId},thread_id.eq.${threadId}`)
        .order('id', { ascending: false })
        .limit(MAX_HISTORY);
      const turns = (data ?? []).filter((r) => r.answer).reverse();
      history = turns.map((r) => ({ question: r.question, answer: r.answer as string }));
      const actions = await actionsFor(asker.userId, turns.map((r) => r.id));
      const earlier = [...actions.values()].flat();
      earlierChanges = earlier.map(actionNote);
      for (const a of earlier) inConversation.add(a.id);
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
      usualAccount: ledger?.default_payment_account ?? null,
      earlierChanges,
    };
    const who = { contractorId: asker.userId, ledger };
    // Changes the answer prepares: held for the member to confirm, shown with the answer.
    const actions: AskActionView[] = [];
    // Earlier changes it took back, so the page stops offering them.
    const withdrawn: number[] = [];
    const propose = async (name: string, input: unknown) => {
      if (name === WITHDRAW_TOOL.name) {
        const res = await withdrawAction(asker.userId, input, inConversation);
        if (res.withdrawn !== null) withdrawn.push(res.withdrawn);
        return res.toModel;
      }
      const { toModel, action } = await proposeAction(id, who, name, input);
      if (action) {
        actions.push(action);
        inConversation.add(action.id);
      }
      return toModel;
    };

    const result = await answerQuestion(question, history, ctx, who, (e: AskEvent) => send(e), propose);
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
      send({ t: 'done', id, answer: result.answer, actions, withdrawn, balance: await balanceOrNull(asker.userId) });
      return;
    }

    // No answer, so nothing it prepared is offered either.
    if (actions.length) await admin.from('ask_actions').delete().eq('question_id', id).eq('status', 'pending');

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
    await admin.from('ask_actions').delete().eq('question_id', id).eq('status', 'pending');
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
