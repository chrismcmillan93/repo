-- Chris signed in and, following the (expected) "no trip yet" onboarding
-- flow, created a fresh empty trip. Remove that duplicate and reassign his
-- real, fully-seeded trip (which predates auth, hence the null user_id) to
-- his new account instead.
--
-- One-off data fix, not a repeatable schema change -- the ids below are
-- real values looked up at the time (auth.users.id for
-- chris@chris-mcmillan.co.uk, and the duplicate trip he'd just created).
delete from usa.trips where id = 'd8725330-5f33-4f76-bcee-064c96cdeee4';

update usa.trips
set user_id = 'eee628e0-2900-44c6-8756-d1359de6bb3b'
where id = '0ba65c3f-a86c-4321-8b22-6d777e387f1a';
