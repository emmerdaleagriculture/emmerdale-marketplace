'use client';

import { useState } from 'react';

/**
 * A value on its own line, in bold, with a copy button beside it (the
 * receipts email address). Tapping copies it and says "Copied" for a moment.
 */
export function CopyText({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1800);
  };

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
      <b style={{ overflowWrap: 'anywhere' }}>{text}</b>
      <button
        type="button"
        onClick={copy}
        aria-label={`${label} ${text}`}
        title={label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          minHeight: 32,
          padding: '4px 10px',
          border: '1px solid var(--rule)',
          borderRadius: 999,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        {state === 'copied' ? (
          <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 9h11v11H9zM5 15H4V4h11v1" />
          </svg>
        )}
        <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Press and hold to copy' : label}</span>
      </button>
    </span>
  );
}
