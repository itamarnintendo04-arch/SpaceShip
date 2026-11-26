-- Personal coupon grants: give a coupon to one existing player, even when the coupon is disabled (active = false)
-- or expired. Add a row in Table Editor -> coupon_grants with the coupon `code` and the player's `handle`
-- (with or without @). The coupon then shows in that player's Codes & gifts and only they can redeem it, once.
-- Optional `expires_at` on the grant limits how long they have to redeem it.
create table if not exists public.coupon_grants (
  id bigint generated always as identity primary key,
  code text not null references public.coupons(code) on update cascade on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  handle text,
  note text,
  expires_at timestamptz,
  granted_at timestamptz not null default now(),
  unique (code, profile_id)
);
alter table public.coupon_grants enable row level security;

-- fill profile_id from the handle (and the handle from profile_id), so a row can be added with just the handle
create or replace function public.coupon_grants_fill() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.profile_id is null then
    select id into new.profile_id from public.profiles where lower(handle) = lower(ltrim(trim(coalesce(new.handle, '')), '@'));
    if new.profile_id is null then raise exception 'No player with handle %', new.handle; end if;
  end if;
  select handle into new.handle from public.profiles where id = new.profile_id;
  select code into new.code from public.coupons where upper(code) = upper(trim(new.code));
  if new.code is null then raise exception 'No such coupon'; end if;
  return new;
end $$;
drop trigger if exists coupon_grants_fill on public.coupon_grants;
create trigger coupon_grants_fill before insert or update on public.coupon_grants for each row execute function public.coupon_grants_fill();

create or replace function public.redeem_coupon(p_id uuid, p_secret text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.coupons; v_data jsonb; g public.coupon_grants;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v from public.coupons where upper(code) = upper(trim(coalesce(p_code, ''))) for update;
  if v.code is null then raise exception 'coupon_not_found'; end if;
  select * into g from public.coupon_grants where code = v.code and profile_id = p_id;
  if exists (select 1 from public.coupon_redemptions where code = v.code and profile_id = p_id) then raise exception 'coupon_used'; end if;
  if g.code is not null then
    -- granted to this player: works even if the coupon is disabled, expired or used up
    if g.expires_at is not null and now() > g.expires_at then raise exception 'coupon_expired'; end if;
  else
    if not v.active then raise exception 'coupon_not_found'; end if;
    if v.personal and not exists (select 1 from public.gift_unlocks u where u.code = v.code and u.profile_id = p_id) then raise exception 'coupon_not_found'; end if;
    if v.starts_at is not null and now() < v.starts_at then raise exception 'coupon_not_found'; end if;
    if v.expires_at is not null and now() > v.expires_at then raise exception 'coupon_expired'; end if;
    if v.max_uses is not null and v.uses >= v.max_uses then raise exception 'coupon_used_up'; end if;
  end if;
  insert into public.coupon_redemptions(code, profile_id, coins, gems) values (v.code, p_id, v.coins, v.gems);
  update public.coupons set uses = uses + 1 where code = v.code;
  select coalesce(data, '{}'::jsonb) into v_data from public.profiles where id = p_id;
  v_data := jsonb_set(jsonb_set(v_data, '{coins}', to_jsonb(coalesce((v_data->>'coins')::numeric, 0)::bigint + v.coins)),
                      '{gems}', to_jsonb(coalesce((v_data->>'gems')::numeric, 0)::bigint + v.gems));
  if v.ship is not null and not coalesce(v_data->'ships', '[]'::jsonb) ? v.ship then
    v_data := jsonb_set(v_data, '{ships}', coalesce(v_data->'ships', '["falcon"]'::jsonb) || to_jsonb(v.ship));
  end if;
  if v.world is not null and not coalesce(v_data->'worlds', '[]'::jsonb) ? v.world then
    v_data := jsonb_set(v_data, '{worlds}', coalesce(v_data->'worlds', '[]'::jsonb) || to_jsonb(v.world));
  end if;
  update public.profiles set data = v_data, updated_at = now() where id = p_id;
  return jsonb_build_object('code', v.code, 'coins', v.coins, 'gems', v.gems, 'ship', v.ship, 'world', v.world);
end $$;

create or replace function public.free_gifts(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(x order by (x->>'personal')::boolean desc, x->>'at' desc) from (
    -- coupons granted to this player (any state)
    select jsonb_build_object('code', c.code, 'coins', c.coins, 'gems', c.gems, 'ship', c.ship, 'world', c.world, 'note', coalesce(g.note, c.note),
                              'expires_at', g.expires_at, 'personal', true, 'at', g.granted_at) x
    from public.coupon_grants g join public.coupons c on c.code = g.code
    where g.profile_id = p_id and (g.expires_at is null or g.expires_at > now())
      and not exists (select 1 from public.coupon_redemptions r where r.code = c.code and r.profile_id = p_id)
    union all
    select jsonb_build_object('code', c.code, 'coins', c.coins, 'gems', c.gems, 'ship', c.ship, 'world', c.world, 'note', c.note,
                              'expires_at', c.expires_at, 'personal', c.personal, 'at', c.created_at)
    from public.coupons c
    where c.active
      and (c.is_gift or (c.personal and exists (select 1 from public.gift_unlocks u where u.code = c.code and u.profile_id = p_id)))
      and (c.starts_at is null or c.starts_at <= now()) and (c.expires_at is null or c.expires_at > now())
      and (c.max_uses is null or c.uses < c.max_uses)
      and not exists (select 1 from public.coupon_grants g where g.code = c.code and g.profile_id = p_id)
      and not exists (select 1 from public.coupon_redemptions r where r.code = c.code and r.profile_id = p_id)
  ) s), '[]'::jsonb);
end $$;

-- all coupons off (they stay in the table, disabled)
update public.coupons set active = false;
