import { NextResponse, after } from 'next/server';
import { verifySvixSignature } from '@/lib/webhooks/svix';
import { handleInboundEmail } from '@/lib/books/inbound.server';
import { processReceipt } from '@/lib/books/receipts.server';

// The AI reads run after the response.
export const maxDuration = 300;

/**
 * POST /api/books/inbound-email: Resend inbound webhook for receipts sent to
 * receipts+<code>@emmerdaleagriculture.com. Verified with the Svix-style
 * signature (BOOKS_INBOUND_WEBHOOK_SECRET, else RESEND_INBOUND_WEBHOOK_SECRET).
 * Mail for other addresses is acknowledged and ignored, so one Resend
 * webhook can feed both this and the quote-reply route.
 *
 * Replies at once; the files are stored before the reply (so a retry finds
 * the Message-ID and books nothing twice) and read afterwards.
 */
export async function POST(request: Request) {
  const secret = process.env.BOOKS_INBOUND_WEBHOOK_SECRET || process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook secret not set' }, { status: 500 });

  const body = await request.text();
  if (!verifySvixSignature(body, request.headers, secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!event.type?.includes('email.received')) return NextResponse.json({ received: true, ignored: event.type });

  try {
    const outcome = await handleInboundEmail(event.data ?? {});
    if (outcome.kind === 'stored') {
      for (const id of outcome.toRead) after(() => processReceipt(id));
      return NextResponse.json({ received: true, receipts: outcome.toRead.length, held: outcome.held });
    }
    return NextResponse.json({ received: true, ignored: outcome.reason });
  } catch (err) {
    console.error('[books] inbound email failed', err instanceof Error ? err.message : err);
    // 500 so Resend retries; the Message-ID check stops a retry booking twice.
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
