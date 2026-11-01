-- Word filter for anything people can type that other people see.
--
-- Enforced in the database (triggers), so it cannot be bypassed from the browser, and it
-- covers every write path (direct table writes and the SECURITY DEFINER functions alike).
-- Covered: display names (leaderboard_opt_in, profiles), Instagram handles (leaderboard_opt_in,
-- hike_attendees), team names, and hike text (title, area, status note, meeting-point note,
-- and the message to the host).
--
-- How matching works (private.has_blocked_word):
--   * text is lower-cased and common look-alikes are mapped (0 o, 1 i, 3 e, 4 a, 5 s, 7 t, 8 b,
--     @ a, $ s, ! i, | l), then split into letter-only tokens;
--   * 'word' entries must equal a whole token (so "Arsenal" and "Cumbria" are fine);
--     stretched spellings still match ("fuuuck", via x+ patterns);
--   * 'substring' entries (the strongest words) match anywhere inside a token, and for names,
--     handles and team names ("strict") also across the whole text with separators removed
--     ("f.u.c.k", "big fuckface");
--   * anything in allowed_words is exempt, so real names and places that contain a blocked
--     string still work (Scunthorpe, Twatt, therapist...).
-- Both lists live in the private schema and are edited through the admin functions.
-- Only values that are being inserted or changed are checked, so an existing row can still
-- be updated for unrelated reasons.
--
-- The error text is readable on purpose: older pages show error messages as they are.

create table private.blocked_words (
  word text primary key check (word ~ '^[a-z]{2,40}$'),
  mode text not null check (mode in ('word', 'substring')),
  -- each letter may be repeated: "fuck" -> f+u+c+k+ ("ass" -> a+s+s+, which does not match "as")
  pattern text generated always as (regexp_replace(word, '(.)', '\1+', 'g')) stored,
  added_at timestamptz not null default now()
);
create table private.allowed_words (
  word text primary key check (word ~ '^[a-z]{2,40}$'),
  pattern text generated always as (regexp_replace(word, '(.)', '\1+', 'g')) stored,
  added_at timestamptz not null default now()
);
revoke all on private.blocked_words, private.allowed_words from public, anon, authenticated;

insert into private.blocked_words (word, mode) values
  -- strongest words: blocked anywhere inside a token
  ('fuck','substring'),('shit','substring'),('cunt','substring'),('nigg','substring'),('faggot','substring'),
  ('bollock','substring'),('wanker','substring'),('pussy','substring'),('whore','substring'),('slut','substring'),
  ('bastard','substring'),('retard','substring'),('dildo','substring'),('jizz','substring'),('blowjob','substring'),
  ('handjob','substring'),('rapist','substring'),('hitler','substring'),('cumshot','substring'),('bellend','substring'),
  ('arsehole','substring'),('asshole','substring'),('dickhead','substring'),('paedophile','substring'),
  ('pedophile','substring'),('motherfuck','substring'),('cocksuck','substring'),('nigger','substring'),
  -- whole words only
  ('cock','word'),('dick','word'),('penis','word'),('vagina','word'),('arse','word'),('ass','word'),
  ('tits','word'),('cum','word'),('porn','word'),('rape','word'),('nazi','word'),('kkk','word'),('paki','word'),
  ('chink','word'),('kike','word'),('coon','word'),('spic','word'),('fag','word'),('twat','word'),('wank','word'),
  ('piss','word'),('pissed','word'),('bitch','word'),('prick','word'),('knob','word'),('pedo','word'),
  ('paedo','word'),('tranny','word'),('anal','word'),('spastic','word'),('spaz','word'),('nonce','word'),
  ('fuk','word'),('fck','word');

insert into private.allowed_words (word) values
  -- places, surnames and ordinary words that contain a blocked string
  ('scunthorpe'),('shitterton'),('twatt'),('swank'),('swanky'),('retardant'),('niggle'),('niggled'),('niggling'),
  ('therapist'),('therapists'),('dikshit'),('mishit'),('shitake'),('cocksfoot'),('cockermouth'),('penistone');

create function private.has_blocked_word(p text, p_strict boolean default true) returns boolean
language plpgsql stable security definer set search_path = private, public, pg_temp as $$
declare
  s text; tok text; t2 text; compact text; a record;
begin
  if p is null or btrim(p) = '' then return false; end if;
  s := translate(lower(p), '0134578@$!|', 'oieastbasil');

  for tok in select x from regexp_split_to_table(s, '[^a-z]+') x where x <> '' loop
    if exists (select 1 from private.allowed_words w where tok ~ ('^' || w.pattern || '$')) then continue; end if;
    if exists (select 1 from private.blocked_words b where tok ~ ('^' || b.pattern || '$')) then return true; end if;
    t2 := tok;
    for a in select pattern from private.allowed_words loop t2 := regexp_replace(t2, a.pattern, '', 'g'); end loop;
    if exists (select 1 from private.blocked_words b where b.mode = 'substring' and t2 ~ b.pattern) then return true; end if;
  end loop;

  if p_strict then
    compact := regexp_replace(s, '[^a-z]', '', 'g');
    for a in select pattern from private.allowed_words loop compact := regexp_replace(compact, a.pattern, '', 'g'); end loop;
    if exists (select 1 from private.blocked_words b where b.mode = 'substring' and compact ~ b.pattern) then return true; end if;
  end if;
  return false;
end $$;

create function private.assert_clean(p text, p_strict boolean default true) returns void
language plpgsql stable security definer set search_path = private, public, pg_temp as $$
begin
  if private.has_blocked_word(p, p_strict) then
    raise exception 'That contains a word that isn''t allowed here. Please change it.';
  end if;
end $$;

-- trigger functions (SECURITY DEFINER so they can read the private lists whoever is writing) ----
create function private.trg_clean_leaderboard() returns trigger
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then perform private.assert_clean(new.display_name, true); end if;
  if tg_op = 'INSERT' or new.instagram_handle is distinct from old.instagram_handle then perform private.assert_clean(new.instagram_handle, true); end if;
  return new;
end $$;
create trigger clean_text before insert or update on public.leaderboard_opt_in
  for each row execute function private.trg_clean_leaderboard();

create function private.trg_clean_profile() returns trigger
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then perform private.assert_clean(new.display_name, true); end if;
  return new;
end $$;
create trigger clean_text before insert or update on public.profiles
  for each row execute function private.trg_clean_profile();

create function private.trg_clean_team() returns trigger
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.name is distinct from old.name then perform private.assert_clean(new.name, true); end if;
  return new;
end $$;
create trigger clean_text before insert or update on public.teams
  for each row execute function private.trg_clean_team();

create function private.trg_clean_hike() returns trigger
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title then perform private.assert_clean(new.title, false); end if;
  if tg_op = 'INSERT' or new.area is distinct from old.area then perform private.assert_clean(new.area, false); end if;
  if tg_op = 'INSERT' or new.status_note is distinct from old.status_note then perform private.assert_clean(new.status_note, false); end if;
  return new;
end $$;
create trigger clean_text before insert or update on public.hikes
  for each row execute function private.trg_clean_hike();

create function private.trg_clean_hike_private() returns trigger
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.meet_note is distinct from old.meet_note then perform private.assert_clean(new.meet_note, false); end if;
  return new;
end $$;
create trigger clean_text before insert or update on public.hike_private
  for each row execute function private.trg_clean_hike_private();

create function private.trg_clean_attendee() returns trigger
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.message is distinct from old.message then perform private.assert_clean(new.message, false); end if;
  if tg_op = 'INSERT' or new.instagram_handle is distinct from old.instagram_handle then perform private.assert_clean(new.instagram_handle, true); end if;
  return new;
end $$;
create trigger clean_text before insert or update on public.hike_attendees
  for each row execute function private.trg_clean_attendee();

-- the helpers and trigger functions are internal: nobody calls them directly
revoke all on function
  private.has_blocked_word(text, boolean), private.assert_clean(text, boolean),
  private.trg_clean_leaderboard(), private.trg_clean_profile(), private.trg_clean_team(),
  private.trg_clean_hike(), private.trg_clean_hike_private(), private.trg_clean_attendee()
from public, anon, authenticated;
