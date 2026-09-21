-- Retrying an email that was accepted and then failed to arrive.
--
-- The queue retries a send that fails: the worker bumps `attempts` and leaves
-- the row pending. But a message Resend accepts and later reports as failed
-- never comes back round. The webhook writes `delivery_status` and leaves
-- `status` at 'sent', and the worker only ever selects `status = 'pending'`,
-- so the row is finished forever the moment it is picked up.
--
-- That lost six real emails in one minute on 15 Sep 2026 — a provider blip in
-- which every message sent in that window failed — and it drops every
-- Transient/MailboxFull bounce, which Resend explicitly describes as worth
-- trying again later. Both were invisible and both were permanent.
--
-- A retry is a NEW row rather than a reset of the old one, so the failure
-- keeps its own record: /admin/errors is built on these rows and "this
-- message failed, and a later attempt got through" is two facts, not an
-- overwrite of the first by the second.

alter table pending_emails
  -- The row this is a second attempt at. Null for an original send.
  add column if not exists retry_of uuid references pending_emails (id) on delete set null,
  -- Attempt number, carried down the chain. Bounds the retries: the webhook
  -- stops creating them at 2, so one message is tried at most three times.
  add column if not exists retry_count integer not null default 0,
  -- Hold a row back until this time. A full mailbox is still full a minute
  -- later, which is when the queue would otherwise drain it; the point of a
  -- retry is that some time has passed. Null means send on the next drain,
  -- so every existing row and every ordinary send is unaffected.
  add column if not exists send_after timestamptz;

-- The worker's queue query is `status = 'pending'` filtered by send_after, so
-- keep the two together and leave out the rows it will never look at.
create index if not exists pending_emails_sendable_idx
  on pending_emails (send_after)
  where status = 'pending';

-- Walking back from a failure to the attempts that followed it, which is how
-- the admin page tells a resolved failure from a live one.
create index if not exists pending_emails_retry_of_idx
  on pending_emails (retry_of)
  where retry_of is not null;

comment on column pending_emails.retry_of is
  'The pending_emails row this is a retry of; null for an original send.';
comment on column pending_emails.retry_count is
  'Attempt number. 0 = original. The delivery webhook refuses to create a retry above 2.';
comment on column pending_emails.send_after is
  'Hold the row back until this time. Null = eligible on the next drain.';
