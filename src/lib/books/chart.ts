/**
 * The chart of accounts a new set of books starts with (Tally spec 3.1),
 * adjusted by business type: a limited company has a director's loan
 * account and share capital; a sole trader or partnership has the owner's
 * capital and drawings instead. Farming businesses (the default here) also
 * get the farming accounts. Descriptions double as hints for the AI that
 * reads receipts (phase 2), so keep them plain.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type BusinessType = 'sole_trader' | 'limited_company' | 'partnership';

export const BUSINESS_TYPES: Record<BusinessType, string> = {
  sole_trader: 'Sole trader',
  partnership: 'Partnership',
  limited_company: 'Limited company',
};

export type SeedAccount = {
  code: string;
  name: string;
  type: AccountType;
  description?: string;
  is_fixed_asset?: boolean;
  is_system?: boolean;
};

const COMMON: SeedAccount[] = [
  { code: '0030', name: 'Computer equipment', type: 'asset', is_fixed_asset: true, description: 'Laptops, tablets, phones and computers lasting over a year' },
  { code: '0040', name: 'Office equipment & furniture', type: 'asset', is_fixed_asset: true },
  { code: '0050', name: 'Motor vehicles', type: 'asset', is_fixed_asset: true, description: 'Cars, vans and pickups bought for the business' },
  { code: '1100', name: 'Trade debtors', type: 'asset', is_system: true, description: 'Money owed to the business, including by Emmerdale for marketplace jobs' },
  { code: '1200', name: 'Business bank account', type: 'asset', is_system: true, description: 'The main business current account' },
  { code: '1210', name: 'Business credit card', type: 'liability' },
  { code: '1220', name: 'Stripe balance', type: 'asset', is_system: true, description: 'Card payments held by Stripe before paying out to the bank' },
  { code: '2100', name: 'Trade creditors', type: 'liability', description: 'Bills received but not yet paid' },
  { code: '2201', name: 'VAT on sales (output)', type: 'liability', is_system: true },
  { code: '2202', name: 'VAT on purchases (input)', type: 'asset', is_system: true },
  { code: '4000', name: 'Sales', type: 'income', is_system: true, description: 'Work done for customers' },
  { code: '4900', name: 'Other income', type: 'income', description: 'Fallback for money in that is not a sale' },
  { code: '5000', name: 'Cost of sales', type: 'expense', description: 'Materials and goods bought to resell or use on jobs' },
  { code: '6100', name: 'Rent & rates', type: 'expense' },
  { code: '6150', name: 'Repairs & maintenance', type: 'expense', description: 'Repairs to equipment, buildings and vehicles' },
  { code: '6200', name: 'Utilities', type: 'expense' },
  { code: '6300', name: 'Travel', type: 'expense', description: 'Train, taxi, parking and tolls' },
  { code: '6310', name: 'Subsistence', type: 'expense', description: 'Meals while working away' },
  { code: '6320', name: 'Motor expenses', type: 'expense', description: 'Road fuel, servicing, tax and MOT for business vehicles' },
  { code: '6330', name: 'Mileage allowance', type: 'expense', description: 'Mileage claims for a personal vehicle' },
  { code: '6400', name: 'Telephone & internet', type: 'expense' },
  { code: '6410', name: 'Software & subscriptions', type: 'expense', description: 'Apps, software and memberships, including Emmerdale membership' },
  { code: '6500', name: 'Office supplies & stationery', type: 'expense' },
  { code: '6510', name: 'Postage & courier', type: 'expense' },
  { code: '6600', name: 'Advertising & marketing', type: 'expense' },
  { code: '6700', name: 'Professional fees', type: 'expense', description: 'Accountant, legal and consultancy' },
  { code: '6800', name: 'Bank charges', type: 'expense', description: 'Bank fees, including Stripe card fees' },
  { code: '6900', name: 'Insurance', type: 'expense' },
  { code: '6950', name: 'Training', type: 'expense' },
  { code: '6960', name: 'Entertainment', type: 'expense', description: 'Client entertaining; VAT not reclaimable' },
  { code: '6970', name: 'Staff welfare', type: 'expense' },
  { code: '6990', name: 'General expenses', type: 'expense', description: 'Fallback for money out that fits nowhere else' },
];

const LIMITED: SeedAccount[] = [
  { code: '2300', name: "Director's loan account", type: 'liability', description: 'Business costs paid personally by the director, and money the director takes or lends' },
  { code: '3000', name: 'Share capital', type: 'equity' },
  { code: '3100', name: 'Retained earnings', type: 'equity' },
];

const OWNER: SeedAccount[] = [
  { code: '3000', name: 'Capital introduced', type: 'equity', description: 'Money the owner puts in, and business costs paid personally' },
  { code: '3100', name: 'Retained profits', type: 'equity' },
  { code: '3200', name: 'Drawings', type: 'equity', description: 'Money the owner takes out for themselves' },
];

const FARMING: SeedAccount[] = [
  { code: '0060', name: 'Farm machinery & equipment', type: 'asset', is_fixed_asset: true, description: 'Tractors, mowers, toppers, trailers and other machinery lasting over a year' },
  { code: '4100', name: 'Livestock sales', type: 'income' },
  { code: '4110', name: 'Crop & produce sales', type: 'income', description: 'Hay, haylage, straw and other produce sold' },
  { code: '4120', name: 'Grazing & land rental income', type: 'income' },
  { code: '4130', name: 'Subsidies & grants', type: 'income' },
  { code: '5100', name: 'Animal feed', type: 'expense' },
  { code: '5110', name: 'Seed', type: 'expense' },
  { code: '5120', name: 'Fertiliser & sprays', type: 'expense' },
  { code: '5130', name: 'Veterinary & medicines', type: 'expense' },
  { code: '5140', name: 'Livestock purchases', type: 'expense' },
  { code: '5150', name: 'Contractors & machinery hire', type: 'expense', description: 'Subcontractors and hired-in machinery' },
  { code: '5160', name: 'Farm fuel', type: 'expense', description: 'Red diesel and fuel for machinery' },
  { code: '5170', name: 'Fencing, hedging & land maintenance', type: 'expense' },
];

/**
 * The accounts that depend on the business type (how the owner is paid and
 * puts money in). Switching type in Settings writes these over the chart:
 * same codes are renamed, missing ones added, and the old type's extra
 * account (Drawings or Director's loan) is left in place with its history.
 */
export function ownerAccountsFor(businessType: BusinessType): SeedAccount[] {
  return businessType === 'limited_company' ? LIMITED : OWNER;
}

export function chartFor(businessType: BusinessType, farming: boolean): SeedAccount[] {
  const all = [...COMMON, ...(businessType === 'limited_company' ? LIMITED : OWNER), ...(farming ? FARMING : [])];
  return all.sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Where business costs paid out of the owner's own pocket go (mileage, a
 * receipt paid personally): the director's loan for a company, capital
 * introduced otherwise.
 */
export function personalAccountCode(businessType: BusinessType): string {
  return businessType === 'limited_company' ? '2300' : '3000';
}

/** Debit-normal types show balance as debits − credits; the rest the other way. */
export function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}

/** Bank, card and payment-provider accounts (12xx assets and liabilities). */
export function isBankAccount(a: { code: string; type: AccountType | string }): boolean {
  return a.code >= '1200' && a.code < '1300' && (a.type === 'asset' || a.type === 'liability');
}

/**
 * Accounts a purchase or sale can be paid from or into: a bank or card
 * account, the owner's own account (director's loan for a company, capital
 * introduced otherwise), or not paid yet — owed to us (1100 Trade debtors)
 * or by us (2100 Trade creditors).
 */
export function isPaymentAccount(a: { code: string; type: AccountType | string }, businessType: BusinessType): boolean {
  return isBankAccount(a) || a.code === personalAccountCode(businessType) || a.code === '1100' || a.code === '2100';
}

/** Accounts a purchase can be categorised to. */
export function isPurchaseCategory(a: { type: AccountType; is_fixed_asset: boolean }): boolean {
  return a.type === 'expense' || a.is_fixed_asset;
}

export function isSaleCategory(a: { type: AccountType }): boolean {
  return a.type === 'income';
}
