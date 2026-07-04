import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Emmerdale Marketplace',
};

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '6rem 1.5rem',
      }}
    >
      <p style={{ color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.04em', margin: 0 }}>
        EMMERDALE AGRICULTURE
      </p>
      <h1 style={{ fontSize: '2.75rem', lineHeight: 1.1, margin: '0.5rem 0 1rem' }}>
        Emmerdale Marketplace
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '1.125rem', maxWidth: 560 }}>
        Buy and sell within the Emmerdale Agriculture community. This is the
        starter scaffold — Next.js 15 App Router with a Payload CMS backend.
      </p>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
        {/* Hard navigations — /admin and /api are Payload routes, not Next pages. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/admin"
          style={{
            background: 'var(--accent)',
            color: '#08130c',
            fontWeight: 600,
            padding: '0.75rem 1.25rem',
            borderRadius: 8,
          }}
        >
          Open admin →
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/listings"
          style={{
            border: '1px solid var(--border)',
            color: 'var(--fg)',
            padding: '0.75rem 1.25rem',
            borderRadius: 8,
          }}
        >
          Listings API
        </a>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '3rem' }}>
        Next steps: run the dev server, create the first admin user at{' '}
        <code>/admin</code>, then add a <code>Listings</code> record.
      </p>
    </main>
  );
}
