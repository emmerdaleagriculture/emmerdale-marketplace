import Link from 'next/link';
import { redirect } from 'next/navigation';
import { confirmLinkAction } from './actions';
import { linkFailedPath } from './linkFailedPath';
import { SiteFooter } from '@/components/SiteFooter';
import f from '@/components/forms/forms.module.css';
import a from '../../auth.module.css';

/**
 * Email link landing for the token-hash flow — the password reset email
 * points here: /auth/confirm?token_hash=…&type=recovery&next=/reset-password/update
 *
 * The token is NOT spent when this page loads. It is spent by the button.
 *
 * Until 2026-10-17 this was a route handler that called verifyOtp on GET,
 * and Next answers HEAD with the GET handler. Mail clients and link scanners
 * (Hotmail/Outlook, seen in the Vercel logs as a HEAD a second before the
 * person's own GET) fetch a link before the browser opens it, so the scanner
 * got the session and the person got "that link has already been used" —
 * twice in a row, for a contractor who was then stuck with no working
 * password. A single-use token must not be consumed by anything that merely
 * loads the URL; a page that waits for a click is the standard answer, and
 * costs one tap.
 *
 * Unlike /auth/callback's PKCE code exchange, verifying a token hash needs
 * nothing from the browser that asked for the email, so the link still works
 * when the email is opened on another device.
 */
export default async function ConfirmLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : '';
  const type = typeof params.type === 'string' ? params.type : '';
  const next = typeof params.next === 'string' ? params.next : '';

  // Mangled link: nothing to spend, so say so straight away.
  if (!tokenHash || !type) redirect(linkFailedPath(type || null));

  const recovery = type === 'recovery';

  return (
    <div className={a.wrap}>
      <header style={{ background: 'var(--jd-green-deep)', padding: '18px 24px' }}>
        <Link
          href="/"
          style={{
            fontFamily: 'var(--font-display-stack)',
            color: 'var(--white)',
            fontSize: 18,
            letterSpacing: '0.03em',
          }}
        >
          Emmerdale Agriculture
        </Link>
      </header>
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Your account</div>
          <h1 className={a.title}>{recovery ? 'Reset your password' : 'Confirm your email'}</h1>
          <p className={a.sub}>
            {recovery
              ? 'One more tap and you can choose a new password.'
              : 'One more tap to confirm this email address.'}
          </p>
          <form action={confirmLinkAction} className={a.card}>
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next} />
            <p style={{ marginTop: 0 }}>
              This link only works once, so we wait for you rather than opening it
              automatically.
            </p>
            <div className={a.actions}>
              <button className={f.btnPrimary} type="submit">
                {recovery ? 'Set a new password' : 'Continue'}
              </button>
              <span className={a.altLink}>
                <Link href="/login">Back to log in</Link>
              </span>
            </div>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
