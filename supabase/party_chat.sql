-- Party chat, blocked words, party logos and the rank permissions.
--   leader   : everything; names who is senior / co-leader / leader; sets the blocked words
--   coleader : name, description, logo, public/private; senior -> member; removes anyone except the leader
--   senior   : the party logo
--   member   : regular rank
-- Blocked words show as # per letter in every message (also older ones), case-insensitive.
-- Applied to the live SpaceShip database. Safe to run again.

alter table public.parties add column if not exists logo text not null default 'l1';
alter table public.parties add column if not exists banned_words text[] not null default '{}';

create table if not exists public.party_messages (
  id bigint generated always as identity primary key,
  party_id uuid not null references public.parties(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists party_messages_party_idx on public.party_messages(party_id, id desc);
alter table public.party_messages enable row level security; -- no policies: only through the functions below

create or replace function public.ss_party_json(p public.parties, p_me uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'is_public', p.is_public, 'logo', p.logo,
    'owner', p.owner_id, 'mine', p.owner_id = p_me,
    'code', case when p.is_public or exists (select 1 from public.party_members m where m.party_id = p.id and m.profile_id = p_me) then p.code end,
    'member', exists (select 1 from public.party_members m where m.party_id = p.id and m.profile_id = p_me),
    'count', (select count(*) from public.party_members m where m.party_id = p.id))
$$;

-- replace every blocked word with # for each of its letters
create or replace function public.ss_mask(p_body text, p_words text[]) returns text
language plpgsql immutable set search_path = '' as $$
declare w text; b text := p_body; i int; lw text;
begin
  foreach w in array coalesce(p_words, '{}') loop
    w := trim(w);
    continue when w = '' or position('#' in w) > 0;
    lw := lower(w);
    loop
      i := position(lw in lower(b));
      exit when i = 0;
      b := overlay(b placing repeat('#', char_length(w)) from i for char_length(w));
    end loop;
  end loop;
  return b;
end $$;

create or replace function public.my_parties(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(public.ss_party_json(p, p_id) || jsonb_build_object(
      'my_role', me.role,
      'banned', case when me.role = 'leader' then to_jsonb(p.banned_words) end,
      'last_msg', (select max(id) from public.party_messages pm where pm.party_id = p.id),
      'members', (select jsonb_agg(public.ss_public(pr) || jsonb_build_object('role', m.role,
                    'friend', exists (select 1 from public.friends f where f.a = p_id and f.b = pr.id))
                  order by public.ss_rank(m.role) desc, m.joined_at)
                  from public.party_members m join public.profiles pr on pr.id = m.profile_id where m.party_id = p.id))
      order by p.created_at desc)
    from public.parties p join public.party_members me on me.party_id = p.id and me.profile_id = p_id), '[]'::jsonb);
end $$;

drop function if exists public.create_party(uuid, text, text, text, boolean);
create or replace function public.create_party(p_id uuid, p_secret text, p_name text, p_desc text, p_public boolean, p_logo text default 'l1') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_code text; v public.parties;
begin
  perform public.ss_auth(p_id, p_secret);
  if (select count(*) from public.party_members where profile_id = p_id) >= 10 then raise exception 'too_many_parties'; end if;
  if coalesce(p_logo, 'l1') !~ '^l[0-9]{1,2}$' then p_logo := 'l1'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.parties where code = v_code);
  end loop;
  insert into public.parties(code, name, description, is_public, owner_id, logo)
  values (v_code, left(trim(p_name), 30), left(trim(coalesce(p_desc, '')), 200), coalesce(p_public, true), p_id, coalesce(p_logo, 'l1')) returning * into v;
  insert into public.party_members(party_id, profile_id, role) values (v.id, p_id, 'leader');
  return public.ss_party_json(v, p_id);
end $$;

-- co-leader and leader: name, description, public/private and logo
drop function if exists public.update_party(uuid, text, uuid, text, text, boolean);
create or replace function public.update_party(p_id uuid, p_secret text, p_party uuid, p_name text, p_desc text, p_public boolean, p_logo text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v public.parties;
begin
  perform public.ss_auth(p_id, p_secret);
  if public.ss_rank(public.ss_party_role(p_party, p_id)) < 3 then raise exception 'not_allowed'; end if;
  if p_logo is not null and p_logo !~ '^l[0-9]{1,2}$' then raise exception 'not_allowed'; end if;
  update public.parties set name = left(trim(p_name), 30), description = left(trim(coalesce(p_desc, '')), 200),
    is_public = coalesce(p_public, is_public), logo = coalesce(p_logo, logo)
  where id = p_party returning * into v;
  return public.ss_party_json(v, p_id);
end $$;

-- senior and up: the logo only
create or replace function public.set_party_logo(p_id uuid, p_secret text, p_party uuid, p_logo text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  if public.ss_rank(public.ss_party_role(p_party, p_id)) < 2 or coalesce(p_logo, '') !~ '^l[0-9]{1,2}$' then raise exception 'not_allowed'; end if;
  update public.parties set logo = p_logo where id = p_party;
end $$;

-- leader only: the blocked words (up to 100, each up to 30 letters)
create or replace function public.set_party_banned_words(p_id uuid, p_secret text, p_party uuid, p_words text[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v text[];
begin
  perform public.ss_auth(p_id, p_secret);
  if public.ss_party_role(p_party, p_id) is distinct from 'leader' then raise exception 'not_allowed'; end if;
  select coalesce(array_agg(w order by w), '{}') into v from (
    select distinct left(trim(x), 30) as w from unnest(coalesce(p_words, '{}')) x
    where trim(x) <> '' and position('#' in x) = 0 limit 100) s;
  update public.parties set banned_words = v where id = p_party;
  return to_jsonb(v);
end $$;

-- ranks: only the leader names seniors / co-leaders / a new leader; a co-leader can turn a senior back into a member
create or replace function public.set_party_role(p_id uuid, p_secret text, p_party uuid, p_target uuid, p_role text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare mine text; their text;
begin
  perform public.ss_auth(p_id, p_secret);
  if p_role not in ('leader', 'coleader', 'senior', 'member') or p_target = p_id then raise exception 'not_allowed'; end if;
  mine := public.ss_party_role(p_party, p_id); their := public.ss_party_role(p_party, p_target);
  if their is null then raise exception 'party_not_found'; end if;
  if mine = 'leader' then
    if p_role = 'leader' then
      update public.party_members set role = 'coleader' where party_id = p_party and profile_id = p_id;
      update public.parties set owner_id = p_target where id = p_party;
    end if;
  elsif mine = 'coleader' then
    if not (their = 'senior' and p_role = 'member') then raise exception 'not_allowed'; end if;
  else raise exception 'not_allowed'; end if;
  update public.party_members set role = p_role where party_id = p_party and profile_id = p_target;
end $$;

-- the leader removes anyone; a co-leader removes anyone except the leader
create or replace function public.kick_party_member(p_id uuid, p_secret text, p_party uuid, p_target uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare mine text; their text;
begin
  perform public.ss_auth(p_id, p_secret);
  mine := public.ss_party_role(p_party, p_id); their := public.ss_party_role(p_party, p_target);
  if p_target = p_id or their is null or mine not in ('leader', 'coleader') or their = 'leader' then raise exception 'not_allowed'; end if;
  delete from public.party_members where party_id = p_party and profile_id = p_target;
end $$;

-- chat
create or replace function public.party_messages(p_id uuid, p_secret text, p_party uuid, p_after bigint default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare words text[];
begin
  perform public.ss_auth(p_id, p_secret);
  if public.ss_party_role(p_party, p_id) is null then raise exception 'party_not_found'; end if;
  select banned_words into words from public.parties where id = p_party;
  return coalesce((select jsonb_agg(x order by (x->>'id')::bigint) from (
    select jsonb_build_object('id', m.id, 'body', public.ss_mask(m.body, words), 'at', m.created_at,
      'from', case when pr.id is null then null else jsonb_build_object('id', pr.id, 'handle', pr.handle, 'name', pr.name, 'avatar', pr.avatar) end) x
    from public.party_messages m left join public.profiles pr on pr.id = m.profile_id
    where m.party_id = p_party and m.id > coalesce(p_after, 0)
    order by m.id desc limit 60) s), '[]'::jsonb);
end $$;

create or replace function public.send_party_message(p_id uuid, p_secret text, p_party uuid, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint; b text := trim(coalesce(p_body, ''));
begin
  perform public.ss_auth(p_id, p_secret);
  if public.ss_party_role(p_party, p_id) is null then raise exception 'party_not_found'; end if;
  if b = '' then raise exception 'empty'; end if;
  if exists (select 1 from public.party_messages where party_id = p_party and profile_id = p_id and created_at > now() - interval '700 milliseconds') then raise exception 'too_soon'; end if;
  insert into public.party_messages(party_id, profile_id, body) values (p_party, p_id, left(b, 300)) returning id into v_id;
  delete from public.party_messages where party_id = p_party and id <= v_id - 300; -- keep the last 300
  return jsonb_build_object('id', v_id);
end $$;

revoke execute on function public.ss_mask(text, text[]) from public, anon, authenticated;
grant execute on function public.my_parties(uuid, text), public.create_party(uuid, text, text, text, boolean, text),
  public.update_party(uuid, text, uuid, text, text, boolean, text), public.set_party_logo(uuid, text, uuid, text),
  public.set_party_banned_words(uuid, text, uuid, text[]), public.set_party_role(uuid, text, uuid, uuid, text),
  public.kick_party_member(uuid, text, uuid, uuid), public.party_messages(uuid, text, uuid, bigint),
  public.send_party_message(uuid, text, uuid, text) to anon, authenticated;
