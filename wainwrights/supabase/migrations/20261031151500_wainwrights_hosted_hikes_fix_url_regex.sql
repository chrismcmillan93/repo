-- Fix for 20261031150000_wainwrights_hosted_hikes: create_hike used the regex
-- '^https://[^ ]{1,300}$', but Postgres caps a regex repetition count at 255,
-- so every call failed with "invalid repetition count(s)". Found by the
-- transaction test run straight after the first migration; no hikes existed.
-- Same function, URL check rewritten as a pattern plus a length check.

create or replace function public.create_hike(
  p_title text, p_walk_key text, p_walk_snapshot jsonb, p_area text, p_start_at timestamptz,
  p_spaces int, p_kit text[], p_turnaround text, p_meet_lat numeric, p_meet_lng numeric,
  p_meet_note text, p_contact text, p_team_id uuid, p_ack boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  fells jsonb;
  snap jsonb;
  hid uuid;
  tok text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_ack is not true then raise exception 'ack_required'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 80 then raise exception 'bad_title'; end if;
  if char_length(trim(coalesce(p_area, ''))) not between 2 and 60 then raise exception 'bad_area'; end if;
  if char_length(coalesce(p_walk_key, '')) not between 1 and 80 then raise exception 'bad_walk'; end if;
  perform private.hike_check_fields(p_start_at, p_spaces, p_meet_lat, p_meet_lng, p_kit, p_turnaround, p_meet_note, p_contact);

  if p_walk_snapshot is null or jsonb_typeof(p_walk_snapshot) is distinct from 'object'
     or length(p_walk_snapshot::text) > 6000 then raise exception 'bad_walk'; end if;
  fells := p_walk_snapshot -> 'fells';
  if jsonb_typeof(fells) is distinct from 'array' or jsonb_array_length(fells) not between 1 and 10 then
    raise exception 'bad_walk';
  end if;
  if exists (select 1 from jsonb_array_elements_text(fells) f
             where f not in (select item_id from public.fell_heights)) then
    raise exception 'bad_walk';
  end if;
  snap := jsonb_build_object(
    'label', left(coalesce(p_walk_snapshot ->> 'label', p_title), 120),
    'miles', case when (p_walk_snapshot ->> 'miles') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then (p_walk_snapshot ->> 'miles')::numeric end,
    'ascent', case when (p_walk_snapshot ->> 'ascent') ~ '^[0-9]{1,5}$' then (p_walk_snapshot ->> 'ascent')::numeric end,
    'fells', fells,
    'top_name', left(p_walk_snapshot ->> 'top_name', 60),
    'top_m', case when (p_walk_snapshot ->> 'top_m') ~ '^[0-9]{1,4}$' then (p_walk_snapshot ->> 'top_m')::numeric end,
    'top_lat', case when (p_walk_snapshot ->> 'top_lat') ~ '^-?[0-9]{1,2}(\.[0-9]+)?$' then (p_walk_snapshot ->> 'top_lat')::numeric end,
    'top_lng', case when (p_walk_snapshot ->> 'top_lng') ~ '^-?[0-9]{1,2}(\.[0-9]+)?$' then (p_walk_snapshot ->> 'top_lng')::numeric end,
    'start_name', left(p_walk_snapshot ->> 'start_name', 120),
    'url', case when (p_walk_snapshot ->> 'url') ~ '^https://[^ ]+$' and length(p_walk_snapshot ->> 'url') <= 300
                then p_walk_snapshot ->> 'url' end
  );

  if p_team_id is not null
     and not exists (select 1 from public.teams where id = p_team_id and admin_user_id = uid)
     and not exists (select 1 from public.team_members where team_id = p_team_id and user_id = uid and status = 'approved') then
    raise exception 'not_in_team';
  end if;

  if (select count(*) from public.hikes where host_id = uid and status = 'open' and start_at > now()) >= 10 then
    raise exception 'too_many_hikes';
  end if;

  insert into public.hikes (host_id, title, walk_key, walk_snapshot, area, start_at, spaces, kit,
                            turnaround_time, team_id, host_ack_at)
  values (uid, trim(p_title), p_walk_key, snap, trim(p_area), p_start_at, p_spaces,
          coalesce(p_kit, '{}'), p_turnaround, p_team_id, now())
  returning id, share_token into hid, tok;

  insert into public.hike_private (hike_id, meet_lat, meet_lng, meet_note, host_contact)
  values (hid, p_meet_lat, p_meet_lng, nullif(trim(p_meet_note), ''), nullif(trim(p_contact), ''));

  return jsonb_build_object('id', hid, 'share_token', tok);
end $$;

-- create or replace keeps existing grants, but state them again so this file is safe on its own.
revoke all on function public.create_hike(text, text, jsonb, text, timestamptz, int, text[], text, numeric, numeric, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_hike(text, text, jsonb, text, timestamptz, int, text[], text, numeric, numeric, text, text, uuid, boolean) to authenticated;
