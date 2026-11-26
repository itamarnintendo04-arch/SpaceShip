-- Web store: coin / diamond packs bought on the website (Lemon Squeezy hosted checkout).
--   store_packs  - what is for sale (edit prices / amounts / active here; the site and the game read it live)
--   store_orders - one row per paid order, written ONLY by the website's webhook (service role).
--                  The game claims new orders with claim_purchases() and adds the coins / diamonds.
-- Card details never reach this database: the payment provider's checkout page collects them.
create table if not exists public.store_packs (
  id text primary key,
  sort int not null default 0,
  coins bigint not null default 0,
  gems bigint not null default 0,
  price_cents int not null check (price_cents >= 50),
  currency text not null default 'USD',
  name jsonb not null default '{}'::jsonb,
  badge text,
  active boolean not null default true
);
alter table public.store_packs enable row level security;

create table if not exists public.store_orders (
  id bigint generated always as identity primary key,
  provider text not null default 'lemonsqueezy',
  provider_order_id text not null unique,
  profile_id uuid references public.profiles(id) on delete set null,
  pack_id text references public.store_packs(id),
  coins bigint not null default 0,
  gems bigint not null default 0,
  amount_cents int,
  currency text,
  status text not null default 'paid',   -- paid / refunded
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.store_orders enable row level security;

insert into public.store_packs (id, sort, coins, gems, price_cents, name, badge) values
  ('coins_s', 1, 5000, 0, 99, '{"en":"Pocket of coins","he":"כיס מטבעות"}', null),
  ('coins_m', 2, 30000, 0, 499, '{"en":"Bag of coins","he":"שק מטבעות"}', 'popular'),
  ('coins_l', 3, 75000, 0, 999, '{"en":"Chest of coins","he":"תיבת מטבעות"}', null),
  ('gems_s', 4, 0, 50, 199, '{"en":"Handful of diamonds","he":"חופן יהלומים"}', null),
  ('gems_m', 5, 0, 300, 999, '{"en":"Diamond crate","he":"ארגז יהלומים"}', null),
  ('mega', 6, 100000, 500, 1999, '{"en":"Galaxy bundle","he":"חבילת גלקסיה"}', 'best')
on conflict (id) do nothing;

-- public: the packs for sale (website + game)
create or replace function public.store_packs() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'gems', gems, 'price_cents', price_cents, 'currency', currency, 'name', name, 'badge', badge) order by sort), '[]'::jsonb)
  from public.store_packs where active;
$$;
-- public: check a buyer's @handle on the store page (only the public name and avatar)
create or replace function public.store_player(p_handle text) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'handle', handle, 'name', name, 'avatar', avatar)
  from public.profiles where lower(handle) = lower(ltrim(trim(coalesce(p_handle, '')), '@')) limit 1;
$$;

-- webhook only (service role): record a paid order once
create or replace function public.store_record_order(p_order text, p_profile uuid, p_pack text, p_amount int, p_currency text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.store_packs;
begin
  select * into k from public.store_packs where id = p_pack;
  if k.id is null or p_profile is null then raise exception 'bad_order'; end if;
  insert into public.store_orders (provider_order_id, profile_id, pack_id, coins, gems, amount_cents, currency)
  values (p_order, p_profile, k.id, k.coins, k.gems, p_amount, p_currency)
  on conflict (provider_order_id) do nothing;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.store_refund_order(p_order text) returns void
language sql security definer set search_path = '' as $$
  update public.store_orders set status = 'refunded' where provider_order_id = p_order;
$$;

-- the game: add new paid orders to the player's coins / diamonds (once each)
create or replace function public.claim_purchases(p_id uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_c bigint; v_g bigint; v_n int; v_data jsonb;
begin
  perform public.ss_auth(p_id, p_secret);
  with x as (update public.store_orders set claimed_at = now()
             where profile_id = p_id and status = 'paid' and claimed_at is null returning coins, gems)
  select coalesce(sum(coins), 0), coalesce(sum(gems), 0), count(*) into v_c, v_g, v_n from x;
  if v_n > 0 then
    select coalesce(data, '{}'::jsonb) into v_data from public.profiles where id = p_id;
    v_data := jsonb_set(jsonb_set(v_data, '{coins}', to_jsonb(coalesce((v_data->>'coins')::numeric, 0)::bigint + v_c)),
                        '{gems}', to_jsonb(coalesce((v_data->>'gems')::numeric, 0)::bigint + v_g));
    update public.profiles set data = v_data, updated_at = now() where id = p_id;
  end if;
  return jsonb_build_object('orders', v_n, 'coins', v_c, 'gems', v_g);
end $$;

revoke all on function public.store_record_order(text, uuid, text, int, text), public.store_refund_order(text) from public, anon, authenticated;
grant execute on function public.store_record_order(text, uuid, text, int, text), public.store_refund_order(text) to service_role;
grant execute on function public.store_packs(), public.store_player(text), public.claim_purchases(uuid, text) to anon, authenticated;
