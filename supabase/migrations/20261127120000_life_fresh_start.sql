-- Fresh start on 30 Nov 2026: Life becomes a new plan with no earlier history.
-- Nothing is destroyed: every row in the user-data tables is first copied into
-- `life_archive` (a private schema: RLS on, no policies, no grants, not exposed through
-- the API, so only the database owner can read it), then the live tables are emptied.
-- Settings keep device/Garmin preferences; breaks and the backup nudge clock are reset.
-- Server-only tables (push_config) and push subscriptions are left alone.
create schema if not exists life_archive;
revoke all on schema life_archive from anon, authenticated;

do $$
declare
  t text;
  live text[] := '{}';
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'life' and tablename not in ('settings', 'push_config', 'push_subscriptions')
    order by tablename
  loop
    execute format('create table if not exists life_archive.%I as select * from life.%I', t, t);
    execute format('alter table life_archive.%I enable row level security', t);
    execute format('revoke all on life_archive.%I from anon, authenticated', t);
    live := live || format('life.%I', t);
  end loop;
  create table if not exists life_archive.settings as select * from life.settings;
  alter table life_archive.settings enable row level security;
  revoke all on life_archive.settings from anon, authenticated;
  execute 'truncate table ' || array_to_string(live, ', ') || ' cascade';
end $$;

-- Keep only what is about the device (Garmin prefs, notification times); start the rest clean.
update life.settings set data = coalesce(data - 'breaks' - 'away' - 'backup_started' - 'last_backup', '{}'::jsonb), updated_at = now();
