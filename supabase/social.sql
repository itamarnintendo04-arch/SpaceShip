-- SpaceShip social features: friend requests (search by @ or name, consent needed) and parties (groups of up to 10).
-- Runs after schema.sql. Safe to run again.

-- ---------- friend requests ----------
create table if not exists public.friend_requests (
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create index if not exists friend_requests_to_idx on public.friend_requests(to_id);
alter table public.friend_requests enable row level security;
revoke all on public.friend_requests from anon, authenticated;
create index if not exists profiles_name_idx on public.profiles(lower(name));

-- players matching "@handle" (prefix) or a name (contains), with the relation to me
create or replace function public.search_players(p_id uuid, p_secret text, p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(trim(ltrim(trim(p_q), '@')));
begin
  perform public.ss_auth(p_id, p_secret);
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (
    select public.ss_public(p) || jsonb_build_object('rel',
      case when exists (select 1 from public.friends f where f.a = p_id and f.b = p.id) then 'friend'
           when exists (select 1 from public.friend_requests r where r.from_id = p_id and r.to_id = p.id) then 'sent'
           when exists (select 1 from public.friend_requests r where r.from_id = p.id and r.to_id = p_id) then 'incoming'
           else 'none' end) as x
    from public.profiles p
    where p.id <> p_id and (p.handle like q || '%' or lower(p.name) like '%' || q || '%')
    order by (p.handle = q) desc, (p.handle like q || '%') desc, p.best desc
    limit 20) t), '[]'::jsonb);
end $$;

-- send a request; if they already asked me, we just become friends
create or replace function public.send_friend_request(p_id uuid, p_secret text, p_to uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  if p_to = p_id then raise exception 'self'; end if;
  if not exists (select 1 from public.profiles where id = p_to) then raise exception 'code_not_found'; end if;
  if exists (select 1 from public.friends where a = p_id and b = p_to) then return 'friend'; end if;
  if exists (select 1 from public.friend_requests where from_id = p_to and to_id = p_id) then
    delete from public.friend_requests where (from_id = p_to and to_id = p_id) or (from_id = p_id and to_id = p_to);
    insert into public.friends(a, b) values (p_id, p_to), (p_to, p_id) on conflict do nothing;
    return 'friend';
  end if;
  insert into public.friend_requests(from_id, to_id) values (p_id, p_to) on conflict do nothing;
  return 'sent';
end $$;

create or replace function public.list_friend_requests(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(public.ss_public(p) order by r.created_at desc) from public.friend_requests r join public.profiles p on p.id = r.from_id where r.to_id = p_id), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(public.ss_public(p) order by r.created_at desc) from public.friend_requests r join public.profiles p on p.id = r.to_id where r.from_id = p_id), '[]'::jsonb));
end $$;

-- accept or decline a request I got
create or replace function public.respond_friend_request(p_id uuid, p_secret text, p_from uuid, p_accept boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  if not exists (select 1 from public.friend_requests where from_id = p_from and to_id = p_id) then return 'gone'; end if;
  delete from public.friend_requests where (from_id = p_from and to_id = p_id) or (from_id = p_id and to_id = p_from);
  if p_accept then insert into public.friends(a, b) values (p_id, p_from), (p_from, p_id) on conflict do nothing; return 'friend'; end if;
  return 'declined';
end $$;

create or replace function public.cancel_friend_request(p_id uuid, p_secret text, p_to uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  delete from public.friend_requests where from_id = p_id and to_id = p_to;
end $$;

-- ---------- parties: groups of up to 10 players ----------
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 1 and 30),
  description text not null default '' check (char_length(description) <= 200),
  is_public boolean not null default true,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.party_members (
  party_id uuid not null references public.parties(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (party_id, profile_id)
);
create index if not exists party_members_profile_idx on public.party_members(profile_id);
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
revoke all on public.parties from anon, authenticated;
revoke all on public.party_members from anon, authenticated;

create or replace function public.ss_party_json(p public.parties, p_me uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'is_public', p.is_public,
    'owner', p.owner_id, 'mine', p.owner_id = p_me,
    -- the code is shown to members, and for public parties to everyone
    'code', case when p.is_public or exists (select 1 from public.party_members m where m.party_id = p.id and m.profile_id = p_me) then p.code end,
    'member', exists (select 1 from public.party_members m where m.party_id = p.id and m.profile_id = p_me),
    'count', (select count(*) from public.party_members m where m.party_id = p.id))
$$;

create or replace function public.create_party(p_id uuid, p_secret text, p_name text, p_desc text, p_public boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_code text; v public.parties;
begin
  perform public.ss_auth(p_id, p_secret);
  if (select count(*) from public.party_members where profile_id = p_id) >= 10 then raise exception 'too_many_parties'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.parties where code = v_code);
  end loop;
  insert into public.parties(code, name, description, is_public, owner_id)
  values (v_code, left(trim(p_name), 30), left(trim(coalesce(p_desc, '')), 200), coalesce(p_public, true), p_id) returning * into v;
  insert into public.party_members(party_id, profile_id) values (v.id, p_id);
  return public.ss_party_json(v, p_id);
end $$;

create or replace function public.update_party(p_id uuid, p_secret text, p_party uuid, p_name text, p_desc text, p_public boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v public.parties;
begin
  perform public.ss_auth(p_id, p_secret);
  update public.parties set name = left(trim(p_name), 30), description = left(trim(coalesce(p_desc, '')), 200), is_public = coalesce(p_public, is_public)
  where id = p_party and owner_id = p_id returning * into v;
  if v.id is null then raise exception 'not_owner'; end if;
  return public.ss_party_json(v, p_id);
end $$;

-- public parties by name/description, or any party by its exact code
create or replace function public.search_parties(p_id uuid, p_secret text, p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(trim(p_q));
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(public.ss_party_json(p, p_id)) from (
    select * from public.parties p
    where upper(trim(p_q)) = p.code
       or (p.is_public and (q = '' or lower(p.name) like '%' || q || '%' or lower(p.description) like '%' || q || '%'))
    order by (upper(trim(p_q)) = p.code) desc, (select count(*) from public.party_members m where m.party_id = p.id) desc, p.created_at desc
    limit 30) p), '[]'::jsonb);
end $$;

-- join with a code (works for private parties) or with the id of a public party
create or replace function public.join_party(p_id uuid, p_secret text, p_party uuid, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v public.parties;
begin
  perform public.ss_auth(p_id, p_secret);
  if p_code is not null and trim(p_code) <> '' then select * into v from public.parties where code = upper(trim(p_code));
  else select * into v from public.parties where id = p_party and is_public; end if;
  if v.id is null then raise exception 'party_not_found'; end if;
  if exists (select 1 from public.party_members where party_id = v.id and profile_id = p_id) then return public.ss_party_json(v, p_id); end if;
  if (select count(*) from public.party_members where party_id = v.id) >= 10 then raise exception 'party_full'; end if;
  if (select count(*) from public.party_members where profile_id = p_id) >= 10 then raise exception 'too_many_parties'; end if;
  insert into public.party_members(party_id, profile_id) values (v.id, p_id);
  return public.ss_party_json(v, p_id);
end $$;

create or replace function public.leave_party(p_id uuid, p_secret text, p_party uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_next uuid;
begin
  perform public.ss_auth(p_id, p_secret);
  delete from public.party_members where party_id = p_party and profile_id = p_id;
  if exists (select 1 from public.parties where id = p_party and owner_id = p_id) then
    select profile_id into v_next from public.party_members where party_id = p_party order by joined_at limit 1;
    if v_next is null then delete from public.parties where id = p_party;
    else update public.parties set owner_id = v_next where id = p_party; end if;
  end if;
end $$;

-- my parties with their members
create or replace function public.my_parties(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(public.ss_party_json(p, p_id) || jsonb_build_object('members',
      (select jsonb_agg(public.ss_public(pr) order by m.joined_at) from public.party_members m join public.profiles pr on pr.id = m.profile_id where m.party_id = p.id))
      order by p.created_at desc)
    from public.parties p join public.party_members me on me.party_id = p.id and me.profile_id = p_id), '[]'::jsonb);
end $$;

-- adding friends without their consent is no longer allowed
revoke execute on function public.add_friend(uuid, text, text) from anon, authenticated;
revoke execute on function public.ss_party_json(public.parties, uuid) from public, anon, authenticated;
grant execute on function public.search_players(uuid, text, text), public.send_friend_request(uuid, text, uuid),
  public.list_friend_requests(uuid, text), public.respond_friend_request(uuid, text, uuid, boolean),
  public.cancel_friend_request(uuid, text, uuid),
  public.create_party(uuid, text, text, text, boolean), public.update_party(uuid, text, uuid, text, text, boolean),
  public.search_parties(uuid, text, text), public.join_party(uuid, text, uuid, text),
  public.leave_party(uuid, text, uuid), public.my_parties(uuid, text) to anon, authenticated;
