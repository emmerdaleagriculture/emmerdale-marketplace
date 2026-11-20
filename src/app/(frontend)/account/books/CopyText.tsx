'use client';

import { useState } from 'react';

/**
 * A value in bold (the receipts email address) with a small copy icon at
 * its end, no word. Tapping copies it; the icon turns to a tick for a
 * moment. If the clipboard is refused, a short hint says to press and hold.
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
    <span style={{ display: 'block', margin: '6px 0' }}>
      <b style={{ overflowWrap: 'anywhere' }}>{text}</b>
      <button
        type="button"
        onClick={copy}
        aria-label={`${label} ${text}`}
        title={label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          verticalAlign: 'middle',
          width: 32,
          height: 32,
          marginLeft: 2,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: state === 'copied' ? 'var(--fill-green)' : 'inherit',
          cursor: 'pointer',
        }}
      >
        {state === 'copied' ? (
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 9h11v11H9zM5 15H4V4h11v1" />
          </svg>
        )}
      </button>
      <span aria-live="polite" style={{ fontSize: 13, marginLeft: 4 }}>
        {state === 'failed' ? 'Press and hold to copy' : <span className="sr-only">{state === 'copied' ? 'Copied' : ''}</span>}
      </span>
    </span>
  );
}
