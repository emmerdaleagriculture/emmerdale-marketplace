/**
 * Customers from another bookkeeping app: Xero's contacts export
 * (ContactName, EmailAddress, POAddressLine1 …) or FreshBooks' clients
 * export (Organization, First Name, Last Name, Email …), CSV or Excel.
 * Read by header name, so other apps' exports mostly work too. Pure: no I/O.
 */

export type ImportedCustomer = {
  name: string;
  organisation: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  vat_number: string | null;
};

const key = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const FIELDS = {
  name: ['contactname', 'name', 'clientname', 'customername', 'displayname', 'fullname', 'contact'],
  org: ['organization', 'organisation', 'company', 'companyname', 'businessname', 'clientorganization'],
  first: ['firstname', 'contactfirstname', 'primarycontactfirstname'],
  last: ['lastname', 'surname', 'contactlastname', 'primarycontactlastname'],
  email: ['emailaddress', 'email', 'primaryemail', 'clientemail', 'contactemail'],
  phone: ['phonenumber', 'phone', 'businessphone', 'telephone', 'mobilenumber', 'mobilephone', 'mobile', 'homephone'],
  vat: ['taxnumber', 'vatnumber', 'vatregistrationnumber', 'taxid', 'taxregistrationnumber', 'businessnumber'],
} as const;

/** Address parts in order, postal (PO) before street (SA) in Xero's export. */
const ADDRESS = [
  ['poaddressline1', 'addressline1', 'address1', 'street', 'streetaddress', 'address', 'billingaddress', 'billingstreet'],
  ['poaddressline2', 'addressline2', 'address2', 'street2', 'billingstreet2'],
  ['poaddressline3', 'addressline3', 'address3'],
  ['poaddressline4', 'addressline4', 'address4'],
  ['pocity', 'city', 'town', 'billingcity'],
  ['poregion', 'region', 'county', 'province', 'state', 'provincestate', 'billingprovince', 'billingstate'],
  ['popostalcode', 'postalcode', 'postcode', 'zip', 'zipcode', 'postalzip', 'billingpostalcode', 'billingzip'],
  ['pocountry', 'country', 'billingcountry'],
];
const STREET = [
  ['saaddressline1'],
  ['saaddressline2'],
  ['saaddressline3'],
  ['saaddressline4'],
  ['sacity'],
  ['saregion'],
  ['sapostalcode'],
  ['sacountry'],
];

function pick(h: string[], names: readonly string[]): number {
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

const clean = (s: string | undefined, max: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

export function parseContacts(rows: string[][]): { customers: ImportedCustomer[]; skipped: number } | { error: string } {
  let at = -1;
  let h: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    h = rows[i].map(key);
    if (pick(h, FIELDS.name) >= 0 || pick(h, FIELDS.org) >= 0 || (pick(h, FIELDS.first) >= 0 && pick(h, FIELDS.last) >= 0)) {
      at = i;
      break;
    }
  }
  if (at < 0) return { error: 'That doesn’t look like a contacts or clients export: there’s no name column.' };
  const col = Object.fromEntries(Object.entries(FIELDS).map(([k, names]) => [k, pick(h, names)])) as Record<keyof typeof FIELDS, number>;
  const postal = ADDRESS.map((names) => pick(h, names));
  const street = STREET.map((names) => pick(h, names));
  // Xero only: a supplier-only contact isn't a customer. Without these columns everyone comes in.
  const isCustomer = pick(h, ['iscustomer', 'customer']);
  const isSupplier = pick(h, ['issupplier', 'supplier']);

  const customers: ImportedCustomer[] = [];
  let skipped = 0;
  for (const row of rows.slice(at + 1)) {
    const cell = (i: number) => (i >= 0 ? row[i] : undefined);
    if (!row.some((c) => (c ?? '').trim())) continue;
    const yes = (v: string | undefined) => /^(true|yes|y|1)$/i.test((v ?? '').trim());
    if (isCustomer >= 0 && isSupplier >= 0 && !yes(cell(isCustomer)) && yes(cell(isSupplier))) {
      skipped++;
      continue;
    }
    const person = [clean(cell(col.first), 100), clean(cell(col.last), 100)].filter(Boolean).join(' ') || null;
    const org = clean(cell(col.org), 200);
    const name = clean(cell(col.name), 200) ?? org ?? person;
    if (!name) {
      skipped++;
      continue;
    }
    const parts = (postal.some((i) => clean(cell(i), 200)) ? postal : street).map((i) => clean(cell(i), 200)).filter(Boolean);
    const email = clean(cell(col.email), 254)?.split(/[;,\s]+/)[0] ?? null;
    customers.push({
      name,
      organisation: org && org !== name ? org : null,
      email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.toLowerCase() : null,
      phone: clean(cell(col.phone), 40),
      address: parts.length ? parts.join('\n').slice(0, 500) : null,
      vat_number: clean(cell(col.vat), 20)?.replace(/\s/g, '').toUpperCase() ?? null,
    });
  }
  if (!customers.length) return { error: 'No contacts were found in that file.' };
  return { customers, skipped };
}

/** For spotting a customer that's already in the books: case, spaces and punctuation ignored. */
export const customerKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
