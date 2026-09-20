'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * The last boundary. This catches what nothing else does — an error thrown by
 * the root layout itself, or a React render error that escapes every nested
 * boundary — and until now the app had none at any level, so those reached
 * the customer as Next.js's own default error screen and were recorded
 * nowhere at all.
 *
 * It replaces the root layout when it renders, which is why it carries its
 * own <html> and <body> and cannot use the app's fonts or global stylesheet.
 * Styles are inline for the same reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f7f6f3',
          color: '#23291f',
          font: '16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <main style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.75rem' }}>Something went wrong</h1>
          <p style={{ margin: '0 0 1.5rem', color: '#4a5142' }}>
            Sorry — that page failed to load. We&rsquo;ve been told about it automatically, so
            there&rsquo;s no need to report it. Trying again usually works.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '0.7rem 1.4rem',
              borderRadius: '6px',
              border: '1px solid #23291f',
              background: '#f5c518',
              color: '#23291f',
            }}
          >
            Try again
          </button>
          <p style={{ margin: '1.5rem 0 0', fontSize: '0.875rem', color: '#6b7362' }}>
            Still stuck? <a href="/contact" style={{ color: '#23291f' }}>Get in touch</a> and
            we&rsquo;ll sort it out.
          </p>
        </main>
      </body>
    </html>
  );
}
