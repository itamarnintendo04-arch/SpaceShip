-- Coupon codes and free gifts.
-- Add a row to public.coupons (Supabase → Table Editor → coupons) and it works in the game right away:
--   code       the code players type (not case sensitive), e.g. SPACE100
--   coins      coins it gives            gems  diamonds it gives
--   max_uses   how many players can use it in total (empty = unlimited)
--   starts_at / expires_at   optional time window (empty = always)
--   active     untick to turn it off
--   is_gift    tick to show it in the game as a free gift with a "Claim" button (no need to type the code)
--   note       optional text shown with a free gift, e.g. "Thanks for 1,000 players!"
-- Every player can use each code once. Redemptions are kept in public.coupon_redemptions.

create table if not exists public.coupons (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{3,32}$'),
  coins integer not null default 0 check (coins between 0 and 1000000),
  gems integer not null default 0 check (gems between 0 and 100000),
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  is_gift boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists coupons_code_upper on public.coupons (upper(code));
alter table public.coupons enable row level security;

create table if not exists public.coupon_redemptions (
  code text not null references public.coupons(code) on update cascade on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  coins integer not null default 0,
  gems integer not null default 0,
  at timestamptz not null default now(),
  primary key (code, profile_id)
);
alter table public.coupon_redemptions enable row level security;

-- redeem a code: checks it, records it once per player and adds the reward to the saved progress
create or replace function public.redeem_coupon(p_id uuid, p_secret text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v public.coupons;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v from public.coupons where upper(code) = upper(trim(coalesce(p_code, ''))) for update;
  if v.code is null or not v.active then raise exception 'coupon_not_found'; end if;
  if v.starts_at is not null and now() < v.starts_at then raise exception 'coupon_not_found'; end if;
  if v.expires_at is not null and now() > v.expires_at then raise exception 'coupon_expired'; end if;
  if exists (select 1 from public.coupon_redemptions where code = v.code and profile_id = p_id) then raise exception 'coupon_used'; end if;
  if v.max_uses is not null and v.uses >= v.max_uses then raise exception 'coupon_used_up'; end if;
  insert into public.coupon_redemptions(code, profile_id, coins, gems) values (v.code, p_id, v.coins, v.gems);
  update public.coupons set uses = uses + 1 where code = v.code;
  update public.profiles set
    data = jsonb_set(jsonb_set(coalesce(data, '{}'::jsonb), '{coins}', to_jsonb(coalesce((data->>'coins')::numeric::int, 0) + v.coins)),
                     '{gems}', to_jsonb(coalesce((data->>'gems')::numeric::int, 0) + v.gems)),
    updated_at = now()
  where id = p_id;
  return jsonb_build_object('code', v.code, 'coins', v.coins, 'gems', v.gems);
end $$;

-- free gifts this player can still claim
create or replace function public.free_gifts(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'coins', c.coins, 'gems', c.gems, 'note', c.note, 'expires_at', c.expires_at) order by c.created_at desc)
    from public.coupons c
    where c.is_gift and c.active
      and (c.starts_at is null or c.starts_at <= now()) and (c.expires_at is null or c.expires_at > now())
      and (c.max_uses is null or c.uses < c.max_uses)
      and not exists (select 1 from public.coupon_redemptions r where r.code = c.code and r.profile_id = p_id)), '[]'::jsonb);
end $$;

revoke all on function public.redeem_coupon(uuid, text, text), public.free_gifts(uuid, text) from public;
grant execute on function public.redeem_coupon(uuid, text, text), public.free_gifts(uuid, text) to anon, authenticated;

-- a welcome gift to start with (edit or delete it in the Table Editor)
insert into public.coupons (code, coins, gems, is_gift, note) values ('WELCOME', 500, 10, true, 'Welcome to SpaceShip!')
on conflict (code) do nothing;

-- bigger limits: up to 1,000,000,000 coins and diamonds per code; balances are added as bigint so they never overflow
alter table public.coupons drop constraint if exists coupons_coins_check, drop constraint if exists coupons_gems_check;
alter table public.coupons alter column coins type bigint, alter column gems type bigint;
alter table public.coupons add constraint coupons_coins_check check (coins between 0 and 1000000000),
  add constraint coupons_gems_check check (gems between 0 and 1000000000);
alter table public.coupon_redemptions alter column coins type bigint, alter column gems type bigint;

create or replace function public.redeem_coupon(p_id uuid, p_secret text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v public.coupons;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v from public.coupons where upper(code) = upper(trim(coalesce(p_code, ''))) for update;
  if v.code is null or not v.active then raise exception 'coupon_not_found'; end if;
  if v.starts_at is not null and now() < v.starts_at then raise exception 'coupon_not_found'; end if;
  if v.expires_at is not null and now() > v.expires_at then raise exception 'coupon_expired'; end if;
  if exists (select 1 from public.coupon_redemptions where code = v.code and profile_id = p_id) then raise exception 'coupon_used'; end if;
  if v.max_uses is not null and v.uses >= v.max_uses then raise exception 'coupon_used_up'; end if;
  insert into public.coupon_redemptions(code, profile_id, coins, gems) values (v.code, p_id, v.coins, v.gems);
  update public.coupons set uses = uses + 1 where code = v.code;
  update public.profiles set
    data = jsonb_set(jsonb_set(coalesce(data, '{}'::jsonb), '{coins}', to_jsonb(coalesce((data->>'coins')::numeric, 0)::bigint + v.coins)),
                     '{gems}', to_jsonb(coalesce((data->>'gems')::numeric, 0)::bigint + v.gems)),
    updated_at = now()
  where id = p_id;
  return jsonb_build_object('code', v.code, 'coins', v.coins, 'gems', v.gems);
end $$;
revoke all on function public.redeem_coupon(uuid, text, text) from public;
grant execute on function public.redeem_coupon(uuid, text, text) to anon, authenticated;
