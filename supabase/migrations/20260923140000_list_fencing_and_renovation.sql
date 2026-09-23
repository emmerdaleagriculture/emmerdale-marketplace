-- Fencing and Paddock renovation landed `listed = false` because few
-- contractors covered them (20260922180000, 20260923070000). Since
-- 20260923120000 every contractor is ticked for every service, so both now
-- go on the customer-facing service strips like the rest. Tom's call,
-- 2026-09-23.
update services set listed = true where name in ('Fencing', 'Paddock renovation');
