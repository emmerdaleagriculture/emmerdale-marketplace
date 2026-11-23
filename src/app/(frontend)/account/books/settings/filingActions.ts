'use server';

import { revalidatePath } from 'next/cache';
import { requireBooksWriter } from '@/lib/books/server';
import { filingAvailable, readSecrets, saveSecrets } from '@/lib/books/filing.server';
import { secretsConfigured } from '@/lib/books/secrets';
import { looksLikeKey, tinytax, describeError } from '@/lib/books/tinytax';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

async function gate() {
  const g = await requireBooksWriter();
  if (!g.ok) return { error: g.error } as const;
  if (!g.ledger) return { error: 'Set up your books first.' } as const;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!(await filingAvailable(g.ledger, user?.email))) return { error: 'Year-end filing isn’t available on your account.' } as const;
  if (!secretsConfigured()) return { error: 'Filing isn’t set up on our side yet. Please tell us.' } as const;
  return { ledger: g.ledger } as const;
}

/**
 * Save the TinyTax key and filing logins. Blank fields keep what's saved, so
 * the page never has to send a secret back to the browser.
 */
export async function saveFilingSecretsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await gate();
  if ('error' in g) return { error: g.error };
  const ledger = g.ledger;
  const val = (k: string) => String(fd.get(k) ?? '').trim();
  const apiKey = val('api_key');
  const gatewayId = val('gateway_id').replace(/\s+/g, '');
  const gatewayPassword = String(fd.get('gateway_password') ?? '');
  const authCode = val('auth_code').toUpperCase().replace(/\s+/g, '');

  if (apiKey && !looksLikeKey(apiKey)) return { error: 'That doesn’t look like a TinyTax API key. It starts tt_live_ or tt_test_.' };
  if (gatewayId && !/^[A-Za-z0-9]{12}$/.test(gatewayId)) return { error: 'A Government Gateway user ID is 12 letters and numbers.' };
  if (gatewayPassword && gatewayPassword.length > 200) return { error: 'That password is too long.' };
  if (authCode && !/^[A-Z0-9]{6}$/.test(authCode)) return { error: 'The Companies House authentication code is 6 letters and numbers.' };
  if (!apiKey && !gatewayId && !gatewayPassword && !authCode) return { error: 'Nothing to save: fill in what you want to add or change.' };

  // A new key is tried before it's kept: look the company up with it.
  let found = '';
  if (apiKey) {
    if (!ledger.company_number) return { error: 'Add your company number above and save it first, so the key can be checked.' };
    const r = await tinytax(apiKey).company(ledger.company_number);
    if (!r.ok && (r.status === 401 || r.status === 403)) return { error: `TinyTax didn’t accept that key: ${describeError(r.error)}` };
    if (r.ok) found = r.data.company_name;
    else if (r.status === 404) return { error: `TinyTax can’t find company ${ledger.company_number}. Check the company number above.` };
  }

  const ok = await saveSecrets(ledger, {
    apiKey: apiKey || undefined,
    gatewayId: gatewayId || undefined,
    gatewayPassword: gatewayPassword || undefined,
    authCode: authCode || undefined,
  });
  if (!ok) return { error: 'That didn’t save. Please try again.' };
  revalidatePath('/account/books/settings');
  revalidatePath('/account/books/year-end');
  return { ok: true, message: found ? `Saved. TinyTax found ${found}.` : 'Saved.' };
}

/** Forget one saved item, or all of them. */
export async function removeFilingSecretAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await gate();
  if ('error' in g) return { error: g.error };
  const which = String(fd.get('which') ?? '');
  const all = { apiKey: null, gatewayId: null, gatewayPassword: null, authCode: null };
  const changes =
    which === 'all'
      ? all
      : which === 'apiKey' || which === 'authCode'
        ? { [which]: null }
        : which === 'gateway'
          ? { gatewayId: null, gatewayPassword: null }
          : null;
  if (!changes) return { error: 'Something went wrong. Please refresh and try again.' };
  if (which !== 'all' && !Object.keys(changes).some((k) => readSecrets(g.ledger)[k as keyof typeof all])) return { error: 'That wasn’t saved anyway.' };
  const ok = await saveSecrets(g.ledger, changes);
  revalidatePath('/account/books/settings');
  revalidatePath('/account/books/year-end');
  return ok ? { ok: true, message: 'Removed.' } : { error: 'That didn’t save. Please try again.' };
}
