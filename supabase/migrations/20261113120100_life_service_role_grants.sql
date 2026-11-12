-- The life-push Edge Function runs as service_role: it needs the life tables, and
-- read-only access to the three fitness tables the morning brief quotes.
grant usage on schema life to service_role;
grant select, insert, update, delete on all tables in schema life to service_role;
