-- Party ranks (leader / co-leader / senior / member) and viewing another player's profile.
-- Applied to the live SpaceShip database. Safe to run again.

alter table public.party_members add column if not exists role text not null default 'member'
  check (role in ('leader', 'coleader', 'senior', 'member'));
update public.party_members m set role = 'leader'
  from public.parties p where p.id = m.party_id and p.owner_id = m.profile_id and m.role <> 'leader';

create or replace function public.ss_rank(r text) returns int
language sql immutable set search_path = '' as
$$ select case r when 'leader' then 4 when 'coleader' then 3 when 'senior' then 2 else 1 end $$;

create or replace function public.ss_party_role(p_party uuid, p_who uuid) returns text
language sql stable security definer set search_path = '' as
$$ select role from public.party_members where party_id = p_party and profile_id = p_who $$;

-- members with their rank, highest rank first
create or replace function public.my_parties(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(public.ss_party_json(p, p_id) || jsonb_build_object(
      'my_role', me.role,
      'members', (select jsonb_agg(public.ss_public(pr) || jsonb_build_object('role', m.role,
                    'friend', exists (select 1 from public.friends f where f.a = p_id and f.b = pr.id))
                  order by public.ss_rank(m.role) desc, m.joined_at)
                  from public.party_members m join public.profiles pr on pr.id = m.profile_id where m.party_id = p.id))
      order by p.created_at desc)
    from public.parties p join public.party_members me on me.party_id = p.id and me.profile_id = p_id), '[]'::jsonb);
end $$;

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
  insert into public.party_members(party_id, profile_id, role) values (v.id, p_id, 'leader');
  return public.ss_party_json(v, p_id);
end $$;

-- leader and co-leaders can edit the party
create or replace function public.update_party(p_id uuid, p_secret text, p_party uuid, p_name text, p_desc text, p_public boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v public.parties;
begin
  perform public.ss_auth(p_id, p_secret);
  if public.ss_rank(public.ss_party_role(p_party, p_id)) < 3 then raise exception 'not_allowed'; end if;
  update public.parties set name = left(trim(p_name), 30), description = left(trim(coalesce(p_desc, '')), 200), is_public = coalesce(p_public, is_public)
  where id = p_party returning * into v;
  return public.ss_party_json(v, p_id);
end $$;

-- change a member's rank. Leader: anything, 'leader' hands the party over. Co-leader: member <-> senior only.
create or replace function public.set_party_role(p_id uuid, p_secret text, p_party uuid, p_target uuid, p_role text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare my_r int; their text;
begin
  perform public.ss_auth(p_id, p_secret);
  if p_role not in ('leader', 'coleader', 'senior', 'member') or p_target = p_id then raise exception 'not_allowed'; end if;
  my_r := public.ss_rank(public.ss_party_role(p_party, p_id)); their := public.ss_party_role(p_party, p_target);
  if their is null then raise exception 'party_not_found'; end if;
  if my_r = 4 then
    if p_role = 'leader' then
      update public.party_members set role = 'coleader' where party_id = p_party and profile_id = p_id;
      update public.parties set owner_id = p_target where id = p_party;
    end if;
  elsif my_r = 3 then
    if public.ss_rank(their) > 2 or public.ss_rank(p_role) > 2 then raise exception 'not_allowed'; end if;
  else raise exception 'not_allowed'; end if;
  update public.party_members set role = p_role where party_id = p_party and profile_id = p_target;
end $$;

-- remove a member with a lower rank (leader and co-leaders only)
create or replace function public.kick_party_member(p_id uuid, p_secret text, p_party uuid, p_target uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare my_r int;
begin
  perform public.ss_auth(p_id, p_secret);
  my_r := public.ss_rank(public.ss_party_role(p_party, p_id));
  if my_r < 3 or public.ss_rank(public.ss_party_role(p_party, p_target)) >= my_r then raise exception 'not_allowed'; end if;
  delete from public.party_members where party_id = p_party and profile_id = p_target;
end $$;

-- the leader leaving hands the party to the highest-ranked, longest member
create or replace function public.leave_party(p_id uuid, p_secret text, p_party uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_next uuid; was_leader boolean;
begin
  perform public.ss_auth(p_id, p_secret);
  was_leader := public.ss_party_role(p_party, p_id) = 'leader';
  delete from public.party_members where party_id = p_party and profile_id = p_id;
  if was_leader then
    select profile_id into v_next from public.party_members where party_id = p_party order by public.ss_rank(role) desc, joined_at limit 1;
    if v_next is null then delete from public.parties where id = p_party;
    else
      update public.party_members set role = 'leader' where party_id = p_party and profile_id = v_next;
      update public.parties set owner_id = v_next where id = p_party;
    end if;
  end if;
end $$;

-- another player's profile: public info, progress numbers, our relation and shared parties
create or replace function public.player_profile(p_id uuid, p_secret text, p_target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v from public.profiles where id = p_target;
  if v.id is null then raise exception 'code_not_found'; end if;
  return public.ss_public(v) || jsonb_build_object(
    'skin', coalesce(v.data->>'skin', 'falcon'),
    'levels', (select count(*) from jsonb_object_keys(coalesce(v.data->'levels', '{}'::jsonb))),
    'worlds', coalesce(jsonb_array_length(v.data->'worlds'), 0),
    'ships', coalesce(jsonb_array_length(v.data->'ships'), 1),
    'joined', v.created_at,
    'rel', case when v.id = p_id then 'me'
      when exists (select 1 from public.friends f where f.a = p_id and f.b = v.id) then 'friend'
      when exists (select 1 from public.friend_requests r where r.from_id = p_id and r.to_id = v.id) then 'sent'
      when exists (select 1 from public.friend_requests r where r.from_id = v.id and r.to_id = p_id) then 'incoming'
      else 'none' end,
    'parties', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'role', m2.role))
      from public.party_members m1 join public.party_members m2 on m2.party_id = m1.party_id and m2.profile_id = v.id
      join public.parties p on p.id = m1.party_id where m1.profile_id = p_id), '[]'::jsonb));
end $$;

revoke execute on function public.ss_party_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_party_role(uuid, text, uuid, uuid, text), public.kick_party_member(uuid, text, uuid, uuid),
  public.player_profile(uuid, text, uuid), public.my_parties(uuid, text), public.create_party(uuid, text, text, text, boolean),
  public.update_party(uuid, text, uuid, text, text, boolean), public.leave_party(uuid, text, uuid) to anon, authenticated;
