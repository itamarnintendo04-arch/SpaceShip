-- Clubs: one club per player, three access modes, invitations, and the club on the player's profile.
--   access = 'public' (default): in search, anyone can join (also from a member's profile)
--            'invite' (closed):  only players a member invited (from search / a profile) can join
--            'link'   (open link): anyone with the club link / code can join; not in search
alter table public.parties add column if not exists access text not null default 'public';
update public.parties set access = case when is_public then 'public' else 'link' end where access = 'public' and not is_public;
alter table public.parties drop constraint if exists parties_access_check;
alter table public.parties add constraint parties_access_check check (access in ('public', 'invite', 'link'));

create table if not exists public.party_invites (
  party_id uuid not null references public.parties(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  from_id uuid references public.profiles(id) on delete set null,
  at timestamptz not null default now(),
  primary key (party_id, to_id)
);
alter table public.party_invites enable row level security;

create or replace function public.ss_party_json(p public.parties, p_me uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'is_public', p.access = 'public', 'access', p.access, 'logo', p.logo,
    'owner', p.owner_id, 'mine', p.owner_id = p_me,
    'code', case when p.access <> 'invite' or exists (select 1 from public.party_members m where m.party_id = p.id and m.profile_id = p_me) then p.code end,
    'member', exists (select 1 from public.party_members m where m.party_id = p.id and m.profile_id = p_me),
    'invited', exists (select 1 from public.party_invites i where i.party_id = p.id and i.to_id = p_me),
    'count', (select count(*) from public.party_members m where m.party_id = p.id))
$$;

drop function if exists public.create_party(uuid, text, text, text, boolean, text);
create or replace function public.create_party(p_id uuid, p_secret text, p_name text, p_desc text, p_public boolean, p_logo text default 'l1', p_access text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_code text; v public.parties; v_acc text := coalesce(p_access, case when coalesce(p_public, true) then 'public' else 'link' end);
begin
  perform public.ss_auth(p_id, p_secret);
  if exists (select 1 from public.party_members where profile_id = p_id) then raise exception 'already_in_party'; end if;
  if v_acc not in ('public', 'invite', 'link') then v_acc := 'public'; end if;
  if coalesce(p_logo, 'l1') !~ '^l[0-9]{1,2}$' then p_logo := 'l1'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.parties where code = v_code);
  end loop;
  insert into public.parties(code, name, description, is_public, access, owner_id, logo)
  values (v_code, left(trim(p_name), 30), left(trim(coalesce(p_desc, '')), 200), v_acc = 'public', v_acc, p_id, coalesce(p_logo, 'l1')) returning * into v;
  insert into public.party_members(party_id, profile_id, role) values (v.id, p_id, 'leader');
  delete from public.party_invites where to_id = p_id;
  return public.ss_party_json(v, p_id);
end $$;

drop function if exists public.update_party(uuid, text, uuid, text, text, boolean, text);
create or replace function public.update_party(p_id uuid, p_secret text, p_party uuid, p_name text, p_desc text, p_public boolean, p_logo text default null, p_access text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.parties; v_acc text;
begin
  perform public.ss_auth(p_id, p_secret);
  if public.ss_rank(public.ss_party_role(p_party, p_id)) < 3 then raise exception 'not_allowed'; end if;
  if p_logo is not null and p_logo !~ '^l[0-9]{1,2}$' then raise exception 'not_allowed'; end if;
  select access into v_acc from public.parties where id = p_party;
  v_acc := coalesce(p_access, case when p_public is null then v_acc when p_public then 'public' when v_acc = 'public' then 'link' else v_acc end);
  if v_acc not in ('public', 'invite', 'link') then raise exception 'not_allowed'; end if;
  update public.parties set name = left(trim(p_name), 30), description = left(trim(coalesce(p_desc, '')), 200),
    access = v_acc, is_public = v_acc = 'public', logo = coalesce(p_logo, logo)
  where id = p_party returning * into v;
  return public.ss_party_json(v, p_id);
end $$;

create or replace function public.join_party(p_id uuid, p_secret text, p_party uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.parties; v_inv boolean; v_by_code boolean := p_code is not null and trim(p_code) <> '';
begin
  perform public.ss_auth(p_id, p_secret);
  if v_by_code then select * into v from public.parties where code = upper(trim(p_code));
  else select * into v from public.parties where id = p_party; end if;
  if v.id is null then raise exception 'party_not_found'; end if;
  if exists (select 1 from public.party_members where party_id = v.id and profile_id = p_id) then return public.ss_party_json(v, p_id); end if;
  v_inv := exists (select 1 from public.party_invites where party_id = v.id and to_id = p_id);
  -- who may come in: public = anyone; link = with the link/code; invite = invited players only
  if not (v_inv or v.access = 'public' or (v.access = 'link' and v_by_code)) then
    raise exception '%', case when v.access = 'invite' then 'party_invite_only' else 'party_not_found' end;
  end if;
  if exists (select 1 from public.party_members where profile_id = p_id) then raise exception 'already_in_party'; end if;
  if (select count(*) from public.party_members where party_id = v.id) >= 10 then raise exception 'party_full'; end if;
  insert into public.party_members(party_id, profile_id) values (v.id, p_id);
  delete from public.party_invites where to_id = p_id;
  return public.ss_party_json(v, p_id);
end $$;

create or replace function public.search_parties(p_id uuid, p_secret text, p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(trim(p_q));
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(public.ss_party_json(p, p_id)) from (
    select * from public.parties p
    where (upper(trim(p_q)) = p.code and p.access <> 'invite')
       or (p.access = 'public' and (q = '' or lower(p.name) like '%' || q || '%' or lower(p.description) like '%' || q || '%'))
    order by (upper(trim(p_q)) = p.code) desc, (select count(*) from public.party_members m where m.party_id = p.id) desc, p.created_at desc
    limit 30) p), '[]'::jsonb);
end $$;

-- invite a player to my club (any member can invite; the player must not be in a club)
create or replace function public.invite_to_party(p_id uuid, p_secret text, p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.parties;
begin
  perform public.ss_auth(p_id, p_secret);
  select p.* into v from public.parties p join public.party_members m on m.party_id = p.id and m.profile_id = p_id;
  if v.id is null then raise exception 'party_not_found'; end if;
  if p_target = p_id or not exists (select 1 from public.profiles where id = p_target) then raise exception 'code_not_found'; end if;
  if exists (select 1 from public.party_members where profile_id = p_target) then raise exception 'target_in_party'; end if;
  if (select count(*) from public.party_members where party_id = v.id) >= 10 then raise exception 'party_full'; end if;
  insert into public.party_invites(party_id, to_id, from_id) values (v.id, p_target, p_id)
    on conflict (party_id, to_id) do update set from_id = excluded.from_id, at = now();
  return public.ss_party_json(v, p_target);
end $$;

create or replace function public.my_party_invites(p_id uuid, p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(public.ss_party_json(p, p_id) || jsonb_build_object('from', (select public.ss_public(pr) from public.profiles pr where pr.id = i.from_id)) order by i.at desc)
    from public.party_invites i join public.parties p on p.id = i.party_id where i.to_id = p_id), '[]'::jsonb);
end $$;

create or replace function public.decline_party_invite(p_id uuid, p_secret text, p_party uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  delete from public.party_invites where party_id = p_party and to_id = p_id;
end $$;

-- the player's profile shows their club; 'can_join' = I may join it from here
create or replace function public.player_profile(p_id uuid, p_secret text, p_target uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles; c public.parties; r text;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v from public.profiles where id = p_target;
  if v.id is null then raise exception 'code_not_found'; end if;
  select p.* into c from public.parties p join public.party_members m on m.party_id = p.id and m.profile_id = v.id limit 1;
  select role into r from public.party_members where profile_id = v.id limit 1;
  return public.ss_public(v) || jsonb_build_object(
    'skin', coalesce(v.data->>'skin', 'falcon'),
    'levels', (select count(*) from jsonb_object_keys(coalesce(v.data->'levels', '{}'::jsonb))),
    'worlds', coalesce(jsonb_array_length(v.data->'worlds'), 0),
    'ships', coalesce(jsonb_array_length(v.data->'ships'), 1),
    'joined', v.created_at,
    'rel', case when v.id = p_id then 'me'
      when exists (select 1 from public.friends f where f.a = p_id and f.b = v.id) then 'friend'
      when exists (select 1 from public.friend_requests r2 where r2.from_id = p_id and r2.to_id = v.id) then 'sent'
      when exists (select 1 from public.friend_requests r2 where r2.from_id = v.id and r2.to_id = p_id) then 'incoming'
      else 'none' end,
    'club', case when c.id is null then null else public.ss_party_json(c, p_id) || jsonb_build_object('role', r,
      'can_join', not exists (select 1 from public.party_members where profile_id = p_id)
        and (c.access = 'public' or exists (select 1 from public.party_invites i where i.party_id = c.id and i.to_id = p_id))
        and (select count(*) from public.party_members m where m.party_id = c.id) < 10) end,
    'my_club', exists (select 1 from public.party_members where profile_id = p_id),
    'in_club', c.id is not null,
    'parties', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'role', m2.role))
      from public.party_members m1 join public.party_members m2 on m2.party_id = m1.party_id and m2.profile_id = v.id
      join public.parties p on p.id = m1.party_id where m1.profile_id = p_id), '[]'::jsonb));
end $$;

grant execute on function public.create_party(uuid, text, text, text, boolean, text, text), public.update_party(uuid, text, uuid, text, text, boolean, text, text),
  public.invite_to_party(uuid, text, uuid), public.my_party_invites(uuid, text), public.decline_party_invite(uuid, text, uuid) to anon, authenticated;
