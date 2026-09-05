'use client';

import { useState } from 'react';
import { suggestKnownProviderTypo } from '@/lib/email/typos';
import f from './forms.module.css';

/**
 * An email input that offers a correction when the domain is one slip away
 * from a mailbox provider everyone uses — gmial.com, hotmial.co.uk.
 *
 * The server's DNS check is the one that blocks, and it catches domains that
 * do not exist. It cannot catch these: typosquatters register the popular
 * misspellings, so gmial.com resolves, accepts the mail, and swallows it. The
 * only defence is asking the person who typed it, while they are still here.
 *
 * So this suggests and never insists. Submitting past the suggestion is
 * allowed — someone really might be at a domain that reads like a typo.
 */
export function EmailField({
  name,
  label = 'Email',
  required = false,
  defaultValue = '',
  autoComplete = 'email',
  hint,
}: {
  name: string;
  label?: string;
  required?: boolean;
  defaultValue?: string;
  autoComplete?: string;
  hint?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  return (
    <label className={f.field}>
      <span className={f.label}>{label}</span>
      <input
        className={f.input}
        type="email"
        name={name}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          // Clear as they type; re-check once they've finished.
          if (suggestion) setSuggestion(null);
        }}
        onBlur={(e) => setSuggestion(suggestKnownProviderTypo(e.target.value))}
      />
      {hint && !suggestion && <span className={f.hint}>{hint}</span>}
      {suggestion && (
        <span className={f.hint}>
          Did you mean{' '}
          <button
            type="button"
            className={f.linkButton}
            onClick={() => {
              setValue(suggestion);
              setSuggestion(null);
            }}
          >
            {suggestion}
          </button>
          ?
        </span>
      )}
    </label>
  );
}
