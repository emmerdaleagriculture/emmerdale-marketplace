import type { AccountType, BusinessType } from './chart';

/**
 * The accounts someone gives a starting balance for by hand: everything on
 * the balance sheet except the owner's equity (that takes the difference)
 * and input VAT (a VAT balance is one figure, owed to HMRC, on 2201).
 */
export function startingAccounts<T extends { code: string; type: AccountType | string }>(accounts: T[]): (T & { type: 'asset' | 'liability' })[] {
  return accounts.filter((a): a is T & { type: 'asset' | 'liability' } => (a.type === 'asset' || a.type === 'liability') && a.code !== '2202');
}

/** Where the difference goes: retained earnings for a company, the owner's capital otherwise. */
export function equityCodeFor(businessType: BusinessType): string {
  return businessType === 'limited_company' ? '3100' : '3000';
}
