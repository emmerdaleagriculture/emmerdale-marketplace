-- ============================================================================
-- Switch the deposit model on: 15% at booking, the rest on sign-off.
--
-- 20260910120000 shipped the machinery with sq_deposit_rate = 1.0, which is
-- the old 100%-up-front behaviour exactly, so the code could go live without
-- changing anything for a customer. This is the flip, recorded as a migration
-- rather than a hand-typed UPDATE so the repo says what production is doing.
--
-- To stand it down: set the value back to '1.0'. No deploy either way — every
-- page and email reads the rate rather than assuming it.
-- ============================================================================

update app_config
   set value = '0.15', updated_at = now()
 where key = 'sq_deposit_rate';
