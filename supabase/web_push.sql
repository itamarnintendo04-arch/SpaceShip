-- Web Push from the website: the app opens the site's /notify page, the browser subscribes,
-- and the site (/api/push -> Supabase edge function "push") sends the notifications.
-- push_vapid holds the site's VAPID keys: created by the edge function itself, readable only by it (service role).
create table if not exists public.push_vapid (id int primary key default 1 check (id = 1), public_key text not null, private_key text not null, created_at timestamptz default now());
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null, auth text not null,
  lang text not null default 'en',
  ua text,
  created_at timestamptz not null default now(), last_ok timestamptz
);
create index if not exists push_subscriptions_profile on public.push_subscriptions(profile_id);
create table if not exists public.push_link_tokens (token text primary key, profile_id uuid not null references public.profiles(id) on delete cascade, expires_at timestamptz not null);
create table if not exists public.push_prefs (profile_id uuid primary key references public.profiles(id) on delete cascade, friends boolean not null default true, muted uuid[] not null default '{}');
create table if not exists public.push_log (id bigint generated always as identity primary key, sender uuid, kind text, target text, at timestamptz not null default now());
create index if not exists push_log_recent on public.push_log(sender, kind, target, at desc);
alter table public.push_vapid enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_link_tokens enable row level security;
alter table public.push_prefs enable row level security;
alter table public.push_log enable row level security;

-- the app asks for a one-time code (15 minutes) that links this browser's subscription to the account
create or replace function public.push_link_token(p_id uuid, p_secret text) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  perform public.ss_auth(p_id, p_secret);
  delete from public.push_link_tokens where expires_at < now();
  insert into public.push_link_tokens(token, profile_id, expires_at) values (v, p_id, now() + interval '15 minutes');
  return v;
end $$;
-- how many browsers / devices get this player's notifications
create or replace function public.push_status(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return jsonb_build_object('devices', (select count(*) from public.push_subscriptions where profile_id = p_id),
    'prefs', (select to_jsonb(p) - 'profile_id' from public.push_prefs p where profile_id = p_id));
end $$;
-- Friend notifications on/off and muted parties (the same switches as in the app)
create or replace function public.push_set_prefs(p_id uuid, p_secret text, p_friends boolean, p_muted uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  insert into public.push_prefs(profile_id, friends, muted) values (p_id, coalesce(p_friends, true), coalesce(p_muted, '{}'))
  on conflict (profile_id) do update set friends = excluded.friends, muted = excluded.muted;
end $$;
create or replace function public.push_unsubscribe_all(p_id uuid, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  delete from public.push_subscriptions where profile_id = p_id;
end $$;
grant execute on function public.push_link_token(uuid, text), public.push_status(uuid, text), public.push_set_prefs(uuid, text, boolean, uuid[]), public.push_unsubscribe_all(uuid, text) to anon, authenticated;

-- per device: every device turns its own notifications on (device id from the game, or made by the site page)
alter table public.push_subscriptions add column if not exists device text;
alter table public.push_link_tokens add column if not exists device text;
create index if not exists push_subscriptions_device on public.push_subscriptions(profile_id, device);
drop function if exists public.push_link_token(uuid, text);
create or replace function public.push_link_token(p_id uuid, p_secret text, p_device text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  perform public.ss_auth(p_id, p_secret);
  delete from public.push_link_tokens where expires_at < now();
  insert into public.push_link_tokens(token, profile_id, device, expires_at) values (v, p_id, left(p_device, 64), now() + interval '15 minutes');
  return v;
end $$;
drop function if exists public.push_status(uuid, text);
create or replace function public.push_status(p_id uuid, p_secret text, p_device text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return jsonb_build_object('devices', (select count(*) from public.push_subscriptions where profile_id = p_id),
    'this_device', p_device is not null and exists (select 1 from public.push_subscriptions where profile_id = p_id and device = p_device),
    'prefs', (select to_jsonb(p) - 'profile_id' from public.push_prefs p where profile_id = p_id));
end $$;
-- the notifications page shows which account it is connected to (public name and avatar only)
create or replace function public.push_whoami(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('handle', p.handle, 'name', p.name, 'avatar', p.avatar)
  from public.push_link_tokens t join public.profiles p on p.id = t.profile_id
  where t.token = p_token and t.expires_at > now();
$$;
grant execute on function public.push_link_token(uuid, text, text), public.push_status(uuid, text, text), public.push_whoami(text) to anon, authenticated;
