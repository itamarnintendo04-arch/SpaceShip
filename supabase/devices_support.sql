-- Devices: every device a player signs in on, with a name the player can change in the game (Settings -> My devices).
-- The owner of the game sees them in Supabase (Table Editor -> devices) to help players recover their account.
create table if not exists public.devices (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  name text not null,
  platform text, model text, app_version text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (profile_id, device_id)
);
alter table public.devices enable row level security;

create or replace function public.device_seen(p_id uuid, p_secret text, p_device text, p_name text, p_platform text, p_model text, p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  if coalesce(trim(p_device), '') = '' then return null; end if;
  insert into public.devices(profile_id, device_id, name, platform, model, app_version)
  values (p_id, left(p_device, 64), left(coalesce(nullif(trim(p_name), ''), 'Device'), 40), left(p_platform, 30), left(p_model, 60), left(p_version, 20))
  on conflict (profile_id, device_id) do update set last_seen = now(), platform = excluded.platform, model = coalesce(excluded.model, public.devices.model), app_version = excluded.app_version;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.my_devices(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.device_id, 'name', d.name, 'platform', d.platform, 'model', d.model, 'version', d.app_version,
      'first', d.first_seen, 'last', d.last_seen,
      'notifications', exists (select 1 from public.push_subscriptions s where s.profile_id = p_id and s.device = d.device_id)) order by d.last_seen desc)
    from public.devices d where d.profile_id = p_id), '[]'::jsonb);
end $$;

create or replace function public.device_rename(p_id uuid, p_secret text, p_device text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  if coalesce(trim(p_name), '') = '' then raise exception 'write_name'; end if;
  update public.devices set name = left(trim(p_name), 40) where profile_id = p_id and device_id = p_device;
end $$;

create or replace function public.device_remove(p_id uuid, p_secret text, p_device text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  delete from public.push_subscriptions where profile_id = p_id and device = p_device;
  delete from public.devices where profile_id = p_id and device_id = p_device;
end $$;

-- Support requests from the website (/support). Read them in Supabase: Table Editor -> support_tickets
-- (support_view adds the player's account and devices next to each request).
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  handle text, profile_id uuid references public.profiles(id) on delete set null,
  email text, topic text not null, message text not null,
  device_name text, lang text, ua text,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  notes text
);
alter table public.support_tickets enable row level security;

create or replace function public.support_submit(p_handle text, p_email text, p_topic text, p_message text, p_device text, p_lang text, p_ua text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pid uuid; v_h text := lower(ltrim(trim(coalesce(p_handle, '')), '@')); v_id bigint; v_e text := lower(trim(coalesce(p_email, '')));
begin
  if length(trim(coalesce(p_message, ''))) < 5 then raise exception 'support_short'; end if;
  if v_e <> '' and v_e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  if v_e = '' and v_h = '' then raise exception 'support_contact'; end if;
  -- no flooding: at most 5 requests an hour from the same email / @handle
  if (select count(*) from public.support_tickets where created_at > now() - interval '1 hour'
      and ((v_e <> '' and lower(email) = v_e) or (v_h <> '' and lower(handle) = v_h))) >= 5 then raise exception 'too_soon'; end if;
  select id into v_pid from public.profiles where lower(handle) = v_h;
  insert into public.support_tickets(handle, profile_id, email, topic, message, device_name, lang, ua)
  values (nullif(v_h, ''), v_pid, nullif(v_e, ''), left(coalesce(p_topic, 'other'), 30), left(trim(p_message), 4000), left(p_device, 60), left(p_lang, 5), left(p_ua, 200))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace view public.support_view with (security_invoker = true) as
  select t.id, t.created_at, t.status, t.topic, t.handle, p.name as player, coalesce(t.email, p.email) as email, t.message, t.device_name,
    (select string_agg(d.name || ' (' || coalesce(d.platform, '?') || ', ' || to_char(d.last_seen, 'YYYY-MM-DD') || ')', '; ' order by d.last_seen desc)
       from public.devices d where d.profile_id = t.profile_id) as account_devices,
    t.notes
  from public.support_tickets t left join public.profiles p on p.id = t.profile_id
  order by t.created_at desc;
revoke all on public.support_view from anon, authenticated;

grant execute on function public.device_seen(uuid, text, text, text, text, text, text), public.my_devices(uuid, text),
  public.device_rename(uuid, text, text, text), public.device_remove(uuid, text, text),
  public.support_submit(text, text, text, text, text, text, text) to anon, authenticated;
