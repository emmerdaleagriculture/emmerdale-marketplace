/**
 * The App Store / Play reviewers' demo accounts (PRD task 10): one customer,
 * one contractor, on test data real users never see. Idempotent — run it
 * again to reset the data or rotate the password.
 *
 *   npx tsx scripts/seedDemoAccounts.ts            # create or refresh
 *   DEMO_ACCOUNT_PASSWORD=… npx tsx scripts/…     # set the password yourself
 *
 * READS .env.local for the Supabase URL and service-role key.
 *
 * What it makes:
 *   demo-customer@emmerdaleagriculture.com    a customer with three jobs: one
 *                                             out for prices with three in,
 *                                             one booked, one just sent out
 *   demo-contractor@emmerdaleagriculture.com  an approved contractor who was
 *                                             invited to all three: priced
 *                                             one, won one, and has the
 *                                             newest still to price
 * plus two "Operator" contractors so the price list has three cards. All
 * demo contractors cover no counties, so no real job ever reaches them, and
 * every demo job is hidden (job_submissions.hidden_at) so it is left out of
 * the admin board, the metrics and the coverage counts. Both logins have a
 * confirmed phone, so the app's phone gate lets them straight through, and
 * a password, so reviewers can use "Log in with it" on the email screen.
 * With DEMO_EMAIL_CODE set on the site (lib/app/demoAccounts.ts) the email
 * screen itself also takes that fixed code for these two addresses.
 *
 * Demo jobs stay open for 90 days; run this again before they lapse.
 */
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

(globalThis as { WebSocket?: unknown }).WebSocket ??= ws;

/** The site's own token shape (lib/sealedQuotes/tokens.ts): 48 hex characters. */
const token = () => randomBytes(24).toString('hex');

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const line = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, '') : '';
}

const admin = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

const CUSTOMER = 'demo-customer@emmerdaleagriculture.com';
const CONTRACTOR = 'demo-contractor@emmerdaleagriculture.com';
const OPERATORS = ['demo-operator-b@emmerdaleagriculture.com', 'demo-operator-c@emmerdaleagriculture.com'];
// Set DEMO_ACCOUNT_PASSWORD to choose or rotate it; otherwise a fresh one is
// made for new accounts and existing accounts keep the one they have.
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || `Review-${randomBytes(6).toString('base64url')}`;
const ROTATE = Boolean(process.env.DEMO_ACCOUNT_PASSWORD);
let created = false;
const HAMPSHIRE = 4;
const TOPPING = 1;
const HARROWING = 5;

async function upsertUser(email: string, phone: string, name: string) {
  // Found through the profile rows first (no page cap), then the user list.
  const { data: byRow } = await admin.from(email.includes('customer') ? 'customers' : 'contractors').select('id').eq('email', email).maybeSingle();
  let existing: { id: string } | null = byRow ? { id: byRow.id } : null;
  if (!existing) {
    for (let page = 1; page <= 20 && !existing; page++) {
      const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      existing = list.users.find((u) => u.email?.toLowerCase() === email) ?? null;
      if (list.users.length < 1000) break;
    }
  }
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      ...(ROTATE ? { password: PASSWORD } : {}), phone, phone_confirm: true, user_metadata: { full_name: name },
    });
    return existing.id;
  }
  created = true;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, phone, phone_confirm: true, user_metadata: { full_name: name },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const now = new Date();
  const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000).toISOString();

  const customerId = await upsertUser(CUSTOMER, '+447700900001', 'Sam Reviewer');
  const contractorId = await upsertUser(CONTRACTOR, '+447700900002', 'Alex Reviewer');
  const operatorIds = [];
  for (const [i, email] of OPERATORS.entries()) {
    operatorIds.push(await upsertUser(email, `+44770090001${i}`, `Operator ${'BC'[i]}`));
  }

  await admin.from('customers').upsert({
    id: customerId, email: CUSTOMER, contact_name: 'Sam Reviewer', phone: '+447700900001', phone_verified_at: iso(48),
  });
  const contractorRows: Record<string, unknown>[] = [
    { id: contractorId, email: CONTRACTOR, business_name: 'Demo Contracting (reviewer)', contact_name: 'Alex Reviewer', phone: '+447700900002', phone_verified_at: iso(48), base_postcode: 'SO41 8AA', base_lat: 50.76, base_lng: -1.54, services: [TOPPING, HARROWING], status: 'approved', vetted_at: iso(72), notify_new_jobs: false, notify_sms: false, rating_avg: 4.9, rating_count: 12 },
    { id: operatorIds[0], email: OPERATORS[0], business_name: 'Demo Operator B', contact_name: 'Operator B', phone: '+447700900010', base_postcode: 'SO42 7QL', services: [TOPPING], status: 'approved', vetted_at: iso(72), notify_new_jobs: false, notify_sms: false, rating_avg: 4.7, rating_count: 8 },
    { id: operatorIds[1], email: OPERATORS[1], business_name: 'Demo Operator C', contact_name: 'Operator C', phone: '+447700900011', base_postcode: 'BH24 3AA', services: [TOPPING], status: 'approved', vetted_at: iso(72), notify_new_jobs: false, notify_sms: false, rating_avg: null, rating_count: 0 },
  ];
  for (const row of contractorRows) {
    const { error } = await admin.from('contractors').upsert(row as never, { onConflict: 'id' });
    if (error) throw new Error(`contractors: ${error.message}`);
  }
  // No counties: nothing real is ever matched to them.
  await admin.from('contractor_counties').delete().in('contractor_id', [contractorId, ...operatorIds]);

  // Start the demo jobs afresh each run. Through the admin delete, which
  // clears the quotes and invitations that otherwise block a plain delete.
  // A booked job is refused by that delete (it answers ok:false rather
  // than raising) and its accepted price is a foreign key back to it, so
  // every old demo job is cancelled and unhooked from its price first.
  const { data: old } = await admin.from('job_submissions').select('id').eq('customer_id', customerId);
  for (const j of old ?? []) {
    const { error: cErr } = await admin.from('job_submissions').update({ status: 'cancelled', accepted_client_quote_id: null }).eq('id', j.id);
    if (cErr) throw new Error(`could not cancel old demo job ${j.id}: ${cErr.message}`);
    const { data: res, error } = await admin.rpc('admin_delete_submission', { p_submission_id: j.id });
    if (error) throw new Error(`could not remove old demo job ${j.id}: ${error.message}`);
    if (!(res as { ok?: boolean } | null)?.ok) throw new Error(`could not remove old demo job ${j.id}: ${JSON.stringify(res)}`);
  }

  const common = {
    customer_id: customerId, contact_name: 'Sam Reviewer', contact_email: CUSTOMER, contact_phone: '+447700900001',
    postcode: 'SO41 8AA', county_id: HAMPSHIRE, lat: 50.76, lng: -1.54,
    area_value: 4, area_unit: 'acres', area_source: 'stated', hidden_at: iso(1),
  } as Record<string, unknown>;

  const job1 = randomUUID();
  const job2 = randomUUID();
  const job3 = randomUUID();
  // Open for 90 days, so a review a few weeks on still finds live jobs.
  const expires = iso(-24 * 90);
  const { error: jErr } = await admin.from('job_submissions').insert([
    { ...common, id: job1, status: 'quotes_receiving', raw_text: 'Paddock topping, about 4 acres, gate is 10ft, access from the lane.', service_id: TOPPING, service_verbatim: 'Paddock topping', client_token: token(), created_at: iso(30), distributed_at: iso(29), expires_at: expires },
    { ...common, id: job2, status: 'awarded', raw_text: 'Harrowing two paddocks after the winter, 3 acres in all.', service_id: HARROWING, service_verbatim: 'Harrowing', area_value: 3, client_token: token(), created_at: iso(24 * 9), distributed_at: iso(24 * 9), awarded_at: iso(24 * 6), awarded_contractor_id: contractorId, expires_at: expires },
    // The one the reviewer prices: out an hour, nobody has priced it yet.
    { ...common, id: job3, status: 'quotes_receiving', raw_text: 'Topping two paddocks, about 6 acres in all, thistles getting away. Gate off the road, 12ft.', service_id: TOPPING, service_verbatim: 'Paddock topping', area_value: 6, postcode: 'SO42 7QL', lat: 50.82, lng: -1.57, client_token: token(), created_at: iso(1), distributed_at: iso(1), expires_at: expires },
  ]);
  if (jErr) throw new Error(`job_submissions: ${jErr.message}`);

  // Invitations: the demo contractor on both, the operators on the open one.
  const inv = async (submission: string, contractor: string, status: string, label: string, hoursAgo = 29) => {
    // Always opened: the unopened-invitation chasers then leave demo rows alone.
    const { data, error } = await admin.from('job_invitations').insert({
      submission_id: submission, contractor_id: contractor, token: token(), status, display_label: label, distance_miles: 6, sent_at: iso(hoursAgo), opened_at: iso(hoursAgo - 0.5),
    }).select('id, token').single();
    if (error) throw new Error(`job_invitations: ${error.message}`);
    return data as { id: string; token: string };
  };
  const invA = (await inv(job1, contractorId, 'priced', 'Operator A')).id;
  const invB = (await inv(job1, operatorIds[0], 'priced', 'Operator B')).id;
  const invC = (await inv(job1, operatorIds[1], 'priced', 'Operator C')).id;
  const invWon = (await inv(job2, contractorId, 'closed_awarded', 'Operator A')).id;
  const toPrice = await inv(job3, contractorId, 'viewed', 'Operator A', 1);

  // Three prices on the open job, one accepted on the booked one.
  const price = async (submission: string, invitation: string, contractor: string, label: string, pence: number, status: string) => {
    const { data: cq, error } = await admin.from('contractor_quotes').insert({
      submission_id: submission, contractor_id: contractor, invitation_id: invitation, quote_type: 'total', contractor_price_pence: pence, price_basis: 'no_vat', valid_until: iso(-24 * 14), source: 'form', confirmed_by_contractor: true,
    }).select('id').single();
    if (error) throw new Error(`contractor_quotes: ${error.message}`);
    const { data: cl, error: clErr } = await admin.from('client_quotes').insert({
      submission_id: submission, contractor_quote_id: cq.id, contractor_id: contractor, client_price_pence: Math.round(pence * 1.15), markup_rate: 0.15, contractor_display_label: label, contractor_rating_count: 0, valid_until: iso(-24 * 14), status, price_basis: 'no_vat', contractor_note: 'Can do this within the week, weather allowing.',
    }).select('id').single();
    if (clErr) throw new Error(`client_quotes: ${clErr.message}`);
    // The booked job points at the price the customer took, as a real award does.
    if (status === 'accepted') await admin.from('job_submissions').update({ accepted_client_quote_id: cl.id }).eq('id', submission);
  };
  await price(job1, invA, contractorId, 'Operator A', 32000, 'active');
  await price(job1, invB, operatorIds[0], 'Operator B', 36000, 'active');
  await price(job1, invC, operatorIds[1], 'Operator C', 41000, 'active');
  await price(job2, invWon, contractorId, 'Operator A', 24000, 'accepted');

  console.log(`Demo accounts ready.
  customer    ${CUSTOMER}
  contractor  ${CONTRACTOR}
  password    ${ROTATE || created ? PASSWORD : '(unchanged — set DEMO_ACCOUNT_PASSWORD to rotate)'}
  phones      +447700900001 / +447700900002 (already confirmed; no code needed)
  to price    /quote/${toPrice.token}  (the contractor's unpriced job; also first in Jobs to price)
Sign in on the app's email screen with the fixed code (DEMO_EMAIL_CODE on the site),
or with "Have a password? Log in with it".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
