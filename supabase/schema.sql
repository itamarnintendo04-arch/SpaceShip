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
-- login token (shown once at sign-up; @handle + token signs in on another device)
alter table public.profiles add column if not exists token_hash text;
-- optional verified email: replaces the token (@handle + email code signs in)
alter table public.profiles add column if not exists email text unique;

-- one-time email codes (set email / sign in with email)
create table if not exists public.email_codes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('set', 'login')),
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  primary key (profile_id, purpose)
);

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
alter table public.email_codes enable row level security;
revoke all on public.profiles from anon, authenticated;
revoke all on public.friends from anon, authenticated;
revoke all on public.sessions from anon, authenticated;
revoke all on public.email_codes from anon, authenticated;

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

create or replace function public.ss_make_token() returns text
language sql volatile set search_path = '' as
$$ select 'SS-' || array_to_string(array(select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) from generate_series(1, 5)), '-') $$;

create or replace function public.ss_norm_token(t text) returns text
language sql immutable set search_path = '' as
$$ select upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create or replace function public.handle_available(p_handle text) returns boolean
language sql stable security definer set search_path = '' as
$$ select lower(p_handle) ~ '^[a-z0-9_.]{3,20}$'
     and not exists (select 1 from public.profiles where handle = lower(p_handle)) $$;

create or replace function public.register(p_handle text, p_name text, p_avatar text default 'rocket')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_secret text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_code text;
  v_token text := public.ss_make_token();
  v_row public.profiles;
begin
  p_handle := lower(trim(p_handle));
  if p_handle !~ '^[a-z0-9_.]{3,20}$' then raise exception 'bad_handle'; end if;
  if exists (select 1 from public.profiles where handle = p_handle) then raise exception 'handle_taken'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.profiles where friend_code = v_code);
  end loop;
  insert into public.profiles(handle, name, avatar, friend_code, secret_hash, token_hash)
  values (p_handle, left(trim(p_name), 24), coalesce(p_avatar, 'rocket'), v_code, public.ss_hash(v_secret), public.ss_hash(public.ss_norm_token(v_token)))
  returning * into v_row;
  return public.ss_public(v_row) || jsonb_build_object('secret', v_secret, 'token', v_token, 'friend_code', v_code, 'data', v_row.data);
exception when unique_violation then
  raise exception 'handle_taken';
end $$;

create or replace function public.login(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_row public.profiles;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v_row from public.profiles where id = p_id;
  return public.ss_public(v_row) || jsonb_build_object('friend_code', v_row.friend_code, 'data', v_row.data,
    'email', v_row.email, 'has_token', v_row.token_hash is not null, 'cutvid', v_row.cutvid_id is not null);
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

-- ---- sign in on another device ----
create or replace function public.ss_session_login(v_row public.profiles) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return public.ss_public(v_row) || jsonb_build_object('secret', public.ss_new_session(v_row.id), 'friend_code', v_row.friend_code,
    'data', v_row.data, 'email', v_row.email, 'has_token', v_row.token_hash is not null, 'cutvid', v_row.cutvid_id is not null);
end $$;

create or replace function public.login_token(p_handle text, p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.profiles;
begin
  select * into v_row from public.profiles
   where handle = lower(trim(ltrim(p_handle, '@'))) and token_hash = public.ss_hash(public.ss_norm_token(p_token));
  if v_row.id is null then perform pg_sleep(0.5); raise exception 'bad_login'; end if;
  return public.ss_session_login(v_row);
end $$;

create or replace function public.regen_token(p_id uuid, p_secret text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_token text := public.ss_make_token();
begin
  perform public.ss_auth(p_id, p_secret);
  if exists (select 1 from public.profiles where id = p_id and email is not null) then raise exception 'email_set'; end if;
  update public.profiles set token_hash = public.ss_hash(public.ss_norm_token(v_token)) where id = p_id;
  return v_token;
end $$;

-- ---- email (codes are sent by the ss-email edge function through Gmail SMTP) ----
create or replace function public.ss_email_code(p_profile uuid, p_purpose text, p_email text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if exists (select 1 from public.email_codes where profile_id = p_profile and purpose = p_purpose and created_at > now() - interval '30 seconds') then
    raise exception 'too_soon';
  end if;
  insert into public.email_codes(profile_id, purpose, email, code_hash) values (p_profile, p_purpose, lower(p_email), public.ss_hash(v_code))
  on conflict (profile_id, purpose) do update set email = excluded.email, code_hash = excluded.code_hash, attempts = 0, created_at = now(), expires_at = now() + interval '10 minutes';
  return v_code;
end $$;

-- returns the email when the code is right, null otherwise (never raises, so the attempt counter sticks)
create or replace function public.ss_email_check(p_profile uuid, p_purpose text, p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare r public.email_codes;
begin
  select * into r from public.email_codes where profile_id = p_profile and purpose = p_purpose;
  if r.profile_id is null or r.expires_at < now() or r.attempts >= 5 then return null; end if;
  if r.code_hash <> public.ss_hash(trim(p_code)) then
    update public.email_codes set attempts = attempts + 1 where profile_id = p_profile and purpose = p_purpose;
    return null;
  end if;
  delete from public.email_codes where profile_id = p_profile and purpose = p_purpose;
  return r.email;
end $$;

-- service role (edge function): start setting an email -> returns the code to send
create or replace function public.email_set_start(p_id uuid, p_secret text, p_email text) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  p_email := lower(trim(p_email));
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  if exists (select 1 from public.profiles where email = p_email and id <> p_id) then raise exception 'email_taken'; end if;
  return public.ss_email_code(p_id, 'set', p_email);
end $$;

create or replace function public.email_set_confirm(p_id uuid, p_secret text, p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_email text;
begin
  perform public.ss_auth(p_id, p_secret);
  v_email := public.ss_email_check(p_id, 'set', p_code);
  if v_email is null then return null; end if;  -- wrong or expired code
  update public.profiles set email = v_email, token_hash = null where id = p_id;  -- email replaces the token
  return v_email;
end $$;

create or replace function public.email_remove(p_id uuid, p_secret text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_token text := public.ss_make_token();
begin
  perform public.ss_auth(p_id, p_secret);
  update public.profiles set email = null, token_hash = public.ss_hash(public.ss_norm_token(v_token)) where id = p_id;
  return v_token;  -- back to a token
end $$;

-- service role (edge function): @handle + email -> code to send (null when they don't match)
create or replace function public.email_login_start(p_handle text, p_email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.profiles;
begin
  select * into v_row from public.profiles where handle = lower(trim(ltrim(p_handle, '@'))) and email = lower(trim(p_email));
  if v_row.id is null then return null; end if;
  return jsonb_build_object('email', v_row.email, 'name', v_row.name, 'code', public.ss_email_code(v_row.id, 'login', v_row.email));
end $$;

create or replace function public.email_login_confirm(p_handle text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.profiles;
begin
  select * into v_row from public.profiles where handle = lower(trim(ltrim(p_handle, '@')));
  if v_row.id is null or public.ss_email_check(v_row.id, 'login', p_code) is null then
    return jsonb_build_object('error', 'bad_code');
  end if;
  return public.ss_session_login(v_row);
end $$;

create or replace function public.ss_new_session(p_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_secret text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.sessions(profile_id, secret_hash) values (p_id, public.ss_hash(v_secret));
  return v_secret;
end $$;

-- ---- Sign in with CutVid (called only by the cutvid-auth edge function with the service role) ----
create or replace function public.cutvid_login(p_cutvid uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.profiles;
begin
  select * into v_row from public.profiles where cutvid_id = p_cutvid;
  if v_row.id is null then return null; end if;
  return public.ss_session_login(v_row);
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
  public.cutvid_link(uuid, uuid, text), public.email_set_start(uuid, text, text),
  public.email_login_start(text, text) to service_role;
grant execute on function public.handle_available(text), public.register(text, text, text),
  public.login(uuid, text), public.save_progress(uuid, text, jsonb, integer, text, text),
  public.add_friend(uuid, text, text), public.remove_friend(uuid, text, uuid),
  public.list_friends(uuid, text), public.leaderboard(),
  public.login_token(text, text), public.regen_token(uuid, text), public.email_set_confirm(uuid, text, text),
  public.email_remove(uuid, text), public.email_login_confirm(text, text) to anon, authenticated;
