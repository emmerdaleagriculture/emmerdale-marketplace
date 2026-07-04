import { NextResponse } from 'next/server';
import { Resend } from 'resend';

/**
 * POST /api/test-email  — Phase 0 verification gate (spec 12.6.2).
 * Sends a test email via Resend to confirm the API key + verified sender domain
 * work end-to-end. Guarded: the recipient MUST be one of ADMIN_EMAILS, so this
 * route can't be used to send mail to arbitrary addresses.
 *
 * Body (optional): { "to": "you@example.com" }  — defaults to the first admin.
 *
 * Note: nothing delivers until the Resend domain on emmerdaleagriculture.com is
 * verified (spec 12.4). Until then this returns the Resend error, which is the
 * signal that DNS is still pending.
 */
export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'RESEND_API_KEY not set' }, { status: 500 });
  }
  if (!from) {
    return NextResponse.json({ ok: false, error: 'EMAIL_FROM not set' }, { status: 500 });
  }
  if (admins.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'ADMIN_EMAILS not set — no allowed recipient' },
      { status: 500 },
    );
  }

  let to = admins[0];
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.to) to = String(body.to).trim().toLowerCase();
  } catch {
    // no/invalid body — fall back to the first admin
  }

  if (!admins.includes(to)) {
    return NextResponse.json(
      { ok: false, error: `Recipient not allowed. Must be one of ADMIN_EMAILS.` },
      { status: 403 },
    );
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: 'Emmerdale Marketplace — Resend test',
    text:
      'This is the Phase 0 verification email from the Emmerdale Marketplace app.\n' +
      'If you are reading this in your inbox (not spam), Resend is wired correctly.',
  });

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: data?.id, to });
}
