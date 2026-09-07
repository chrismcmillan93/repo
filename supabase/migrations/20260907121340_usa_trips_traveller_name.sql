-- A person's name, not just a trip name, to label whose plan a shared item
-- is when viewed from someone else's account (e.g. "Chris: Kill Tony" reads
-- better cross-account than the trip's own title, "USA trip"). Captured
-- once on the "create your trip" onboarding form -- real sign-in here is
-- just an email link, so trip creation is the actual first-setup moment.
alter table usa.trips add column traveller_name text;

update usa.trips set traveller_name = 'Chris'
where id = '0ba65c3f-a86c-4321-8b22-6d777e387f1a';

-- Backfill anything else so the column can be required going forward.
update usa.trips set traveller_name = 'Traveller' where traveller_name is null;

alter table usa.trips alter column traveller_name set not null;
