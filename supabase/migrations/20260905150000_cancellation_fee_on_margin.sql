-- ============================================================================
-- The cancellation fee is charged on OUR MARGIN, not on the whole price.
--
-- 20260905140000 read clause 9.2 literally — "15% of the amount you paid" —
-- which on a £60,500 job retained £9,075 against a £5,500 margin: more from
-- cancelling than from doing the work. That was never the intent.
--
-- 15% of margin alone does not work either: the margin is 10/110 of the gross,
-- so 15% of it is 1.36% of the total, while Stripe keeps 1.5% + 20p and does
-- not return it on a refund. Every cancellation would have lost money, on
-- every job size. The fee is therefore 15% of margin PLUS the processing fee
-- Stripe actually charged — each part a real cost, which is what a genuine
-- pre-estimate of loss has to be.
--
-- Rate lives in app_config with the others: the spec asks for configuration,
-- not constants, and this is a number a solicitor may want moved.
-- ============================================================================

insert into app_config (key, value) values ('sq_cancellation_fee_rate', '0.15')
on conflict (key) do nothing;
