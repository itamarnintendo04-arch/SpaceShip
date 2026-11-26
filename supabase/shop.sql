-- The shop runs from the server. Edit these tables in Supabase -> Table Editor; the game picks the changes up when it starts.
--   shop_ships  every ship: price (coins) or gems (diamonds), its look (shape, colours, aura, effect), its weapon
--               (rate, dmg, side, style, pierce), sort order, active. New rows = new ships, built from the existing parts.
--               name / description: optional {"en": "...", "he": "..."} for ships the game doesn't know yet.
--               secret = not for sale (world ships, Cosmos, coupon ships).
--   shop_items  upgrades (costs / gems per level), diamond powers and avatars (costs[1] coins or gems[1] diamonds).
--   shop_settings  gem_rate: coins for 1 diamond when converting.
-- Every purchase goes through shop_buy / shop_convert: the server checks the price and the player's balance and saves it.
create table if not exists public.shop_ships (
  id text primary key check (id ~ '^[a-z]{2,20}$'),
  sort integer not null default 1000,
  price integer not null default 0 check (price >= 0),
  gems integer not null default 0 check (gems >= 0),
  secret boolean not null default false,
  world integer check (world between 1 and 4),
  coupon boolean not null default false,
  shape text not null default 'arrow' check (shape in ('arrow','delta','saucer','twin','stealth','phoenix','crystal','dragon','titan','nova','cosmos','chaos')),
  body text not null default '#d7e3ff' check (body ~ '^#[0-9A-Fa-f]{3,8}$'),
  accent text not null default '#3b82f6' check (accent ~ '^#[0-9A-Fa-f]{3,8}$'),
  glow text not null default '#60a5fa' check (glow ~ '^#[0-9A-Fa-f]{3,8}$'),
  aura text check (aura in ('pulse','sparks','spin','cloak','embers','shine','prism','trail','orbit','storm','galaxy','lightning')),
  fx text check (fx in ('ghost','rainbow','aurora','cosmic','chaos')),
  rate numeric(4,2) not null default 1 check (rate between 0.5 and 5),
  dmg numeric(4,2) not null default 1 check (dmg between 0.5 and 20),
  side integer not null default 0 check (side between 0 and 8),
  style text not null default 'line' check (style in ('line','needle','flame','ring','twin','laser','fireball','star','comet','nebula','beam','vortex','wisp','shard','rainbow','void','aurora','supernova','rock','snow','magma','eclipse','cosmic','chaos')),
  pierce boolean not null default false,
  name jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.shop_ships enable row level security;

create table if not exists public.shop_items (
  kind text not null check (kind in ('upgrade','power','avatar')),
  id text not null check (id ~ '^[a-z0-9]{2,20}$'),
  sort integer not null default 1000,
  costs integer[] not null default '{0}',   -- coins (upgrades: one per level)
  gems integer[],                           -- diamonds (upgrades: one per level), optional
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
alter table public.shop_items enable row level security;

create table if not exists public.shop_settings (id integer primary key default 1 check (id = 1), gem_rate integer not null default 10 check (gem_rate between 1 and 100000));
alter table public.shop_settings enable row level security;
insert into public.shop_settings (id) values (1) on conflict do nothing;
insert into public.shop_ships (id, sort, price, gems, secret, world, coupon, shape, body, accent, glow, aura, fx, rate, dmg, side, style, pierce) values
  ('falcon', 10, 0, 0, false, null, false, 'arrow', '#d7e3ff', '#3b82f6', '#60a5fa', null, null, 1, 1, 0, 'line', false),
  ('viper', 20, 300, 0, false, null, false, 'delta', '#bbf7d0', '#16a34a', '#4ade80', 'pulse', null, 1.12, 1.2, 0, 'needle', false),
  ('nova', 30, 600, 0, false, null, false, 'arrow', '#fecaca', '#dc2626', '#f87171', 'sparks', null, 1.18, 1.3, 1, 'flame', false),
  ('saucer', 40, 900, 0, false, null, false, 'saucer', '#e9d5ff', '#9333ea', '#c084fc', 'spin', null, 1.22, 1.4, 1, 'ring', false),
  ('twin', 50, 1400, 0, false, null, false, 'twin', '#fde68a', '#ea580c', '#fb923c', 'pulse', null, 1.28, 1.6, 1, 'twin', false),
  ('phantom', 60, 2000, 0, false, null, false, 'stealth', '#334155', '#22d3ee', '#22d3ee', 'cloak', null, 1.34, 1.9, 2, 'laser', false),
  ('dragon', 70, 3000, 0, false, null, false, 'dragon', '#fb7185', '#7f1d1d', '#fda4af', 'embers', null, 1.4, 2.2, 2, 'fireball', false),
  ('golden', 80, 5000, 0, false, null, false, 'stealth', '#facc15', '#a16207', '#fde047', 'shine', null, 1.5, 2.6, 3, 'star', false),
  ('comet', 90, 7500, 0, false, null, false, 'arrow', '#bae6fd', '#0369a1', '#38bdf8', 'trail', null, 1.58, 2.8, 3, 'comet', false),
  ('nebula', 100, 10000, 0, false, null, false, 'saucer', '#f5d0fe', '#a21caf', '#e879f9', 'orbit', null, 1.64, 3, 3, 'nebula', true),
  ('titan', 110, 15000, 0, false, null, false, 'titan', '#cbd5e1', '#334155', '#f97316', 'storm', null, 1.7, 3.3, 4, 'beam', false),
  ('vortex', 120, 20000, 0, false, null, false, 'crystal', '#a7f3d0', '#047857', '#34d399', 'orbit', null, 1.8, 3.6, 4, 'vortex', false),
  ('phoenix', 130, 0, 15, false, null, false, 'phoenix', '#fdba74', '#c2410c', '#fb923c', 'embers', null, 1.45, 2.4, 2, 'fireball', false),
  ('ghost', 140, 0, 25, false, null, false, 'stealth', '#e0e7ff', '#6366f1', '#a5b4fc', 'cloak', 'ghost', 1.5, 2.5, 2, 'wisp', true),
  ('crystal', 150, 0, 40, false, null, false, 'crystal', '#cffafe', '#0891b2', '#67e8f9', 'prism', null, 1.6, 3, 3, 'shard', false),
  ('rainbow', 160, 0, 60, false, null, false, 'phoenix', '#f0abfc', '#7e22ce', '#f0abfc', 'shine', 'rainbow', 1.75, 3.4, 4, 'rainbow', false),
  ('void', 170, 0, 80, false, null, false, 'titan', '#1e1b4b', '#7c3aed', '#a78bfa', 'storm', 'ghost', 1.85, 3.8, 4, 'void', true),
  ('aurora', 180, 0, 100, false, null, false, 'phoenix', '#a7f3d0', '#0e7490', '#5eead4', 'orbit', 'aurora', 1.95, 4, 5, 'aurora', true),
  ('supernova', 190, 0, 150, false, null, false, 'nova', '#fff7ed', '#ea580c', '#fde047', 'shine', 'rainbow', 2.1, 4.5, 5, 'supernova', true),
  ('asteroid', 200, 0, 0, true, 1, false, 'dragon', '#d6d3d1', '#57534e', '#fb923c', 'sparks', null, 2, 4.2, 5, 'rock', true),
  ('glacier', 210, 0, 0, true, 2, false, 'crystal', '#e0f2fe', '#0369a1', '#7dd3fc', 'prism', null, 2.05, 4.4, 5, 'snow', true),
  ('inferno', 220, 0, 0, true, 3, false, 'phoenix', '#fdba74', '#991b1b', '#f97316', 'embers', null, 2.1, 4.6, 5, 'magma', true),
  ('eclipse', 230, 0, 0, true, 4, false, 'titan', '#1e1036', '#7c3aed', '#c084fc', 'galaxy', 'ghost', 2.2, 4.9, 5, 'eclipse', true),
  ('chaos', 240, 0, 0, true, null, true, 'chaos', '#111827', '#f0f', '#22d3ee', 'lightning', 'chaos', 2.6, 6, 7, 'chaos', true),
  ('cosmos', 250, 0, 0, true, null, false, 'cosmos', '#fef3c7', '#4c1d95', '#f0abfc', 'galaxy', 'cosmic', 2.35, 5.2, 6, 'cosmic', true)
on conflict (id) do nothing;
insert into public.shop_items (kind, id, sort, costs, gems) values
  ('upgrade', 'weapon', 10, '{250,600,1200,2500}', null),
  ('upgrade', 'shield', 20, '{150,300,600,1000,1600}', null),
  ('upgrade', 'magnet', 30, '{200,500,1000}', null),
  ('upgrade', 'life', 40, '{800,2000}', null),
  ('upgrade', 'rate', 50, '{400,900,1800,3500}', null),
  ('upgrade', 'power', 60, '{300,800,1600}', null),
  ('upgrade', 'luck', 70, '{500,1200,2500,5000}', null),
  ('upgrade', 'sides', 80, '{2000,4000,8000,12000}', '{10,20,35,50}'),
  ('power', 'plasma', 10, '{0}', '{30}'),
  ('power', 'shield2', 20, '{0}', '{20}'),
  ('power', 'supermag', 30, '{0}', '{15}'),
  ('power', 'goldheart', 40, '{0}', '{35}'),
  ('power', 'revive', 50, '{0}', '{45}'),
  ('power', 'drone', 60, '{0}', '{55}'),
  ('avatar', 'rocket', 10, '{0}', null),
  ('avatar', 'alien', 20, '{0}', null),
  ('avatar', 'planet', 30, '{0}', null),
  ('avatar', 'ufo', 40, '{150}', null),
  ('avatar', 'astro', 50, '{250}', null),
  ('avatar', 'comet', 60, '{300}', null),
  ('avatar', 'robot', 70, '{400}', null),
  ('avatar', 'moon', 80, '{500}', null),
  ('avatar', 'skull', 90, '{700}', null),
  ('avatar', 'crown', 100, '{1200}', null),
  ('avatar', 'diamond', 110, '{0}', '{8}'),
  ('avatar', 'phoenix', 120, '{0}', '{12}'),
  ('avatar', 'voidav', 130, '{0}', '{30}'),
  ('avatar', 'auroraav', 140, '{0}', '{40}'),
  ('avatar', 'crownx', 150, '{0}', '{60}'),
  ('avatar', 'galaxy', 160, '{0}', '{20}'),
  ('avatar', 'satellite', 170, '{600}', null),
  ('avatar', 'starfish', 180, '{800}', null),
  ('avatar', 'octo', 190, '{1000}', null),
  ('avatar', 'fire', 200, '{1500}', null),
  ('avatar', 'dragonav', 210, '{2500}', null),
  ('avatar', 'blackhole', 220, '{2000}', null)
on conflict (kind, id) do nothing;

-- the whole catalog for the game (anyone can read it)
create or replace function public.shop_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'gem_rate', (select gem_rate from public.shop_settings where id = 1),
    'ships', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'sort', s.sort, 'price', s.price, 'gems', s.gems, 'secret', s.secret, 'world', s.world, 'coupon', s.coupon,
        'shape', s.shape, 'body', s.body, 'accent', s.accent, 'glow', s.glow, 'aura', s.aura, 'fx', s.fx,
        'gun', jsonb_build_object('rate', s.rate, 'dmg', s.dmg, 'side', s.side, 'style', s.style, 'pierce', s.pierce),
        'name', s.name, 'description', s.description, 'active', s.active) order by s.sort, s.id) from public.shop_ships s), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'id', i.id, 'sort', i.sort, 'costs', i.costs, 'gems', i.gems, 'active', i.active) order by i.kind, i.sort) from public.shop_items i), '[]'::jsonb));
$$;

-- buy something: checks price and balance on the server and saves it. p_kind: ship | upgrade | power | avatar
create or replace function public.shop_buy(p_id uuid, p_secret text, p_kind text, p_item text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; c bigint; g bigint; s public.shop_ships; it public.shop_items; lvl integer; base integer; cc integer; gc integer; v_avatar text;
begin
  perform public.ss_auth(p_id, p_secret);
  select coalesce(data, '{}'::jsonb), avatar into d, v_avatar from public.profiles where id = p_id for update;
  c := coalesce((d->>'coins')::numeric, 0)::bigint; g := coalesce((d->>'gems')::numeric, 0)::bigint;
  if p_kind = 'ship' then
    select * into s from public.shop_ships where id = p_item and active and not secret;
    if s.id is null then raise exception 'not_for_sale'; end if;
    if coalesce(d->'ships', '[]'::jsonb) ? s.id then raise exception 'already_owned'; end if;
    cc := case when s.gems > 0 then 0 else s.price end; gc := s.gems;
    if c < cc then raise exception 'not_enough_coins'; end if;
    if g < gc then raise exception 'not_enough_gems'; end if;
    d := jsonb_set(d, '{ships}', coalesce(d->'ships', '["falcon"]'::jsonb) || to_jsonb(s.id));
    d := jsonb_set(d, '{skin}', to_jsonb(s.id));
  else
    select * into it from public.shop_items where kind = p_kind and id = p_item and active;
    if it.id is null then raise exception 'not_for_sale'; end if;
    if p_kind = 'upgrade' then
      base := case when it.id = 'weapon' then 1 else 0 end;
      lvl := coalesce((d->'up'->>it.id)::int, base);
      if lvl - base >= coalesce(array_length(it.costs, 1), 0) then raise exception 'maxed'; end if;
      cc := it.costs[lvl - base + 1]; gc := coalesce(it.gems[lvl - base + 1], 0);
      if c < cc then raise exception 'not_enough_coins'; end if;
      if g < gc then raise exception 'not_enough_gems'; end if;
      d := jsonb_set(d, '{up}', coalesce(d->'up', '{}'::jsonb) || jsonb_build_object(it.id, lvl + 1));
    else
      cc := case when coalesce(it.gems[1], 0) > 0 then 0 else coalesce(it.costs[1], 0) end; gc := coalesce(it.gems[1], 0);
      if p_kind = 'power' and coalesce(d->'items', '[]'::jsonb) ? it.id then raise exception 'already_owned'; end if;
      if p_kind = 'avatar' and (coalesce(d->'avatars', '[]'::jsonb) ? it.id or (cc = 0 and gc = 0)) then raise exception 'already_owned'; end if;
      if c < cc then raise exception 'not_enough_coins'; end if;
      if g < gc then raise exception 'not_enough_gems'; end if;
      if p_kind = 'power' then d := jsonb_set(d, '{items}', coalesce(d->'items', '[]'::jsonb) || to_jsonb(it.id));
      else d := jsonb_set(d, '{avatars}', coalesce(d->'avatars', '[]'::jsonb) || to_jsonb(it.id)); v_avatar := it.id; end if;
    end if;
  end if;
  d := jsonb_set(jsonb_set(d, '{coins}', to_jsonb(c - cc)), '{gems}', to_jsonb(g - gc));
  update public.profiles set data = d, avatar = v_avatar, updated_at = now() where id = p_id;
  return jsonb_build_object('coins', d->'coins', 'gems', d->'gems', 'ships', d->'ships', 'skin', d->'skin', 'up', d->'up', 'items', d->'items', 'avatars', d->'avatars', 'avatar', v_avatar);
end $$;

-- diamonds -> coins at the server's rate
create or replace function public.shop_convert(p_id uuid, p_secret text, p_gems integer) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; g bigint; r integer;
begin
  perform public.ss_auth(p_id, p_secret);
  if p_gems is null or p_gems < 1 then raise exception 'bad_amount'; end if;
  select coalesce(data, '{}'::jsonb) into d from public.profiles where id = p_id for update;
  g := coalesce((d->>'gems')::numeric, 0)::bigint;
  if g < p_gems then raise exception 'not_enough_gems'; end if;
  select gem_rate into r from public.shop_settings where id = 1;
  d := jsonb_set(jsonb_set(d, '{gems}', to_jsonb(g - p_gems)), '{coins}', to_jsonb(coalesce((d->>'coins')::numeric, 0)::bigint + p_gems::bigint * r));
  update public.profiles set data = d, updated_at = now() where id = p_id;
  return jsonb_build_object('coins', d->'coins', 'gems', d->'gems');
end $$;

revoke all on function public.shop_catalog(), public.shop_buy(uuid, text, text, text), public.shop_convert(uuid, text, integer) from public;
grant execute on function public.shop_catalog(), public.shop_buy(uuid, text, text, text), public.shop_convert(uuid, text, integer) to anon, authenticated;
