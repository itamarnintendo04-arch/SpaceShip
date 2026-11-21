-- SpaceShip backend schema (Supabase / Postgres)
-- Tables are locked by RLS (no policies); clients only use the SECURITY DEFINER functions below.

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique check (handle ~ '^[a-z0-9_.]{3,20}$'),
  name text not null check (char_length(name) between 1 and 24),
  avatar text not null default 'rocket',
  friend_code text not null unique,
  secret_hash text not null,
  data jsonb not null default '{}'::jsonb,
  best integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists cutvid_id uuid unique;

-- extra login sessions (one per device signed in with CutVid)
create table if not exists public.sessions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, secret_hash)
);

create table if not exists public.friends (
  a uuid not null references public.profiles(id) on delete cascade,
  b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a <> b)
);
create index if not exists friends_b_idx on public.friends(b);
create index if not exists profiles_best_idx on public.profiles(best desc);

alter table public.profiles enable row level security;
alter table public.friends enable row level security;
alter table public.sessions enable row level security;
revoke all on public.profiles from anon, authenticated;
revoke all on public.friends from anon, authenticated;
revoke all on public.sessions from anon, authenticated;

create or replace function public.ss_hash(s text) returns text
language sql immutable set search_path = '' as
$$ select encode(extensions.digest(s, 'sha256'), 'hex') $$;

create or replace function public.ss_auth(p_id uuid, p_secret text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_id and secret_hash = public.ss_hash(p_secret))
     and not exists (select 1 from public.sessions where profile_id = p_id and secret_hash = public.ss_hash(p_secret)) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  return p_id;
end $$;

create or replace function public.ss_public(p public.profiles) returns jsonb
language sql stable set search_path = '' as
$$ select jsonb_build_object('id', p.id, 'handle', p.handle, 'name', p.name, 'avatar', p.avatar, 'best', p.best) $$;

create or replace function public.handle_available(p_handle text) returns boolean
language sql stable security definer set search_path = '' as
$$ select lower(p_handle) ~ '^[a-z0-9_.]{3,20}$'
     and not exists (select 1 from public.profiles where handle = lower(p_handle)) $$;

create or replace function public.register(p_handle text, p_name text, p_avatar text default 'rocket')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_secret text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_code text;
  v_row public.profiles;
begin
  p_handle := lower(trim(p_handle));
  if p_handle !~ '^[a-z0-9_.]{3,20}$' then raise exception 'bad_handle'; end if;
  if exists (select 1 from public.profiles where handle = p_handle) then raise exception 'handle_taken'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.profiles where friend_code = v_code);
  end loop;
  insert into public.profiles(handle, name, avatar, friend_code, secret_hash)
  values (p_handle, left(trim(p_name), 24), coalesce(p_avatar, 'rocket'), v_code, public.ss_hash(v_secret))
  returning * into v_row;
  return public.ss_public(v_row) || jsonb_build_object('secret', v_secret, 'friend_code', v_code, 'data', v_row.data);
exception when unique_violation then
  raise exception 'handle_taken';
end $$;

create or replace function public.login(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_row public.profiles;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v_row from public.profiles where id = p_id;
  return public.ss_public(v_row) || jsonb_build_object('friend_code', v_row.friend_code, 'data', v_row.data);
end $$;

create or replace function public.save_progress(p_id uuid, p_secret text, p_data jsonb, p_best integer, p_name text, p_avatar text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  if octet_length(p_data::text) > 20000 then raise exception 'too_large'; end if;
  update public.profiles set
    data = p_data,
    best = greatest(best, coalesce(p_best, 0)),
    name = coalesce(nullif(left(trim(p_name), 24), ''), name),
    avatar = coalesce(nullif(p_avatar, ''), avatar),
    updated_at = now()
  where id = p_id;
end $$;

create or replace function public.add_friend(p_id uuid, p_secret text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_f public.profiles;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v_f from public.profiles where friend_code = upper(trim(p_code));
  if v_f.id is null then raise exception 'code_not_found'; end if;
  if v_f.id = p_id then raise exception 'self'; end if;
  insert into public.friends(a, b) values (p_id, v_f.id), (v_f.id, p_id) on conflict do nothing;
  return public.ss_public(v_f);
end $$;

create or replace function public.remove_friend(p_id uuid, p_secret text, p_friend uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  delete from public.friends where (a = p_id and b = p_friend) or (a = p_friend and b = p_id);
end $$;

create or replace function public.list_friends(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(public.ss_public(p) order by p.handle)
                   from public.friends f join public.profiles p on p.id = f.b
                   where f.a = p_id), '[]'::jsonb);
end $$;

create or replace function public.leaderboard() returns jsonb
language sql stable security definer set search_path = '' as
$$ select coalesce(jsonb_agg(x), '[]'::jsonb) from (
     select public.ss_public(p) as x from public.profiles p where p.best > 0 order by p.best desc limit 25) t $$;

-- ---- Sign in with CutVid (called only by the cutvid-auth edge function with the service role) ----
create or replace function public.ss_new_session(p_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_secret text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.sessions(profile_id, secret_hash) values (p_id, public.ss_hash(v_secret));
  return v_secret;
end $$;

create or replace function public.cutvid_login(p_cutvid uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.profiles;
begin
  select * into v_row from public.profiles where cutvid_id = p_cutvid;
  if v_row.id is null then return null; end if;
  return public.ss_public(v_row) || jsonb_build_object('secret', public.ss_new_session(v_row.id), 'friend_code', v_row.friend_code, 'data', v_row.data);
end $$;

create or replace function public.cutvid_register(p_cutvid uuid, p_handle text, p_name text, p_avatar text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v jsonb;
begin
  if exists (select 1 from public.profiles where cutvid_id = p_cutvid) then raise exception 'already_linked'; end if;
  v := public.register(p_handle, p_name, p_avatar);
  update public.profiles set cutvid_id = p_cutvid where id = (v->>'id')::uuid;
  return v;
end $$;

create or replace function public.cutvid_link(p_cutvid uuid, p_id uuid, p_secret text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  if exists (select 1 from public.profiles where cutvid_id = p_cutvid and id <> p_id) then raise exception 'already_linked'; end if;
  update public.profiles set cutvid_id = p_cutvid where id = p_id;
  return public.login(p_id, p_secret);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.cutvid_login(uuid), public.cutvid_register(uuid, text, text, text),
  public.cutvid_link(uuid, uuid, text) to service_role;
grant execute on function public.handle_available(text), public.register(text, text, text),
  public.login(uuid, text), public.save_progress(uuid, text, jsonb, integer, text, text),
  public.add_friend(uuid, text, text), public.remove_friend(uuid, text, uuid),
  public.list_friends(uuid, text), public.leaderboard() to anon, authenticated;
