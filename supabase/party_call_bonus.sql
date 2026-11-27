-- A club member calls the club to play: whoever joins from that call gets a small bonus, once a day.
create table if not exists public.call_bonus_claims (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  coins int not null, gems int not null,
  at timestamptz not null default now(),
  primary key (profile_id, day)
);
alter table public.call_bonus_claims enable row level security;

create or replace function public.claim_call_bonus(p_id uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_c int := 250; v_g int := 3; v_data jsonb;
begin
  perform public.ss_auth(p_id, p_secret);
  if not exists (select 1 from public.party_members where profile_id = p_id) then raise exception 'party_not_found'; end if;
  insert into public.call_bonus_claims(profile_id, coins, gems) values (p_id, v_c, v_g) on conflict do nothing;
  if not found then raise exception 'coupon_used'; end if;
  select coalesce(data, '{}'::jsonb) into v_data from public.profiles where id = p_id;
  v_data := jsonb_set(jsonb_set(v_data, '{coins}', to_jsonb(coalesce((v_data->>'coins')::numeric, 0)::bigint + v_c)),
                      '{gems}', to_jsonb(coalesce((v_data->>'gems')::numeric, 0)::bigint + v_g));
  update public.profiles set data = v_data, updated_at = now() where id = p_id;
  return jsonb_build_object('code', '🎉', 'coins', v_c, 'gems', v_g);
end $$;
grant execute on function public.claim_call_bonus(uuid, text) to anon, authenticated;
