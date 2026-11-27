-- SpaceShip: the Workshop - players build their own ship (custom ships).
-- Building costs shop_settings.custom_coins + custom_gems (default 1,000 coins + 100 diamonds); repainting it later is free.
-- A ship's look is a small description (spec), never code:
--   { shape, body, accent, glow, aura, fx, gun, mirror, stickers: [{ k, x, y, s, r, c, t }] }
-- Every value is checked on the server against fixed lists (ss_custom_clean), so nothing else can get in.
-- Custom ship ids start with "c-" and are kept in profiles.data.ships like any other ship.

alter table public.shop_settings add column if not exists custom_coins integer not null default 1000 check (custom_coins >= 0);
alter table public.shop_settings add column if not exists custom_gems integer not null default 100 check (custom_gems >= 0);
alter table public.shop_settings add column if not exists custom_max integer not null default 20 check (custom_max between 1 and 200);

create table if not exists public.custom_ships (
  id text primary key,
  owner uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists custom_ships_owner on public.custom_ships(owner);
alter table public.custom_ships enable row level security;   -- only through the functions below

-- keeps only allowed values; anything else is replaced by a default
create or replace function public.ss_custom_clean(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare out_st jsonb := '[]'::jsonb; st jsonb; k text; col text; n integer := 0;
  hex constant text := '^#[0-9a-fA-F]{6}$';
  f_num text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then p := '{}'::jsonb; end if;
  if jsonb_typeof(p->'stickers') = 'array' then
    for st in select * from jsonb_array_elements(p->'stickers') loop
      exit when n >= 10;
      continue when jsonb_typeof(st) <> 'object';
      k := st->>'k';
      continue when k is null or k not in ('star','heart','bolt','dot','ring','stripe','play','diamond','flame','skull','wing','text');
      col := coalesce(st->>'c', '#ffffff'); if col !~ hex then col := '#ffffff'; end if;
      out_st := out_st || jsonb_build_object(
        'k', k,
        'x', greatest(-45, least(45, coalesce(case when jsonb_typeof(st->'x') = 'number' then (st->>'x')::numeric end, 0))),
        'y', greatest(-45, least(45, coalesce(case when jsonb_typeof(st->'y') = 'number' then (st->>'y')::numeric end, 0))),
        's', greatest(4, least(40, coalesce(case when jsonb_typeof(st->'s') = 'number' then (st->>'s')::numeric end, 12))),
        'r', greatest(-180, least(180, coalesce(case when jsonb_typeof(st->'r') = 'number' then (st->>'r')::numeric end, 0))),
        'c', col,
        't', case when k = 'text' then left(regexp_replace(coalesce(st->>'t', ''), '[<>&"\\]', '', 'g'), 4) else null end);
      n := n + 1;
    end loop;
  end if;
  return jsonb_build_object(
    'shape',  case when p->>'shape' in ('arrow','delta','saucer','twin','stealth','dragon','titan','crystal','phoenix') then p->>'shape' else 'arrow' end,
    'body',   case when p->>'body' ~ hex then p->>'body' else '#d7e3ff' end,
    'accent', case when p->>'accent' ~ hex then p->>'accent' else '#3b82f6' end,
    'glow',   case when p->>'glow' ~ hex then p->>'glow' else '#60a5fa' end,
    'aura',   case when p->>'aura' in ('pulse','sparks','spin','cloak','embers','shine','trail','orbit','storm','prism') then p->>'aura' else null end,
    'fx',     case when p->>'fx' in ('rainbow','aurora','ghost','cosmic') then p->>'fx' else null end,
    'gun',    case when p->>'gun' in ('line','needle','flame','ring','twin','laser','fireball','star','comet','beam','shard','wisp') then p->>'gun' else 'laser' end,
    'mirror', coalesce((p->>'mirror')::boolean, false),
    'stickers', out_st);
exception when others then
  return jsonb_build_object('shape','arrow','body','#d7e3ff','accent','#3b82f6','glow','#60a5fa','aura',null,'fx',null,'gun','laser','mirror',false,'stickers','[]'::jsonb);
end $$;

create or replace function public.ss_custom_name(p text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(left(btrim(regexp_replace(coalesce(p, ''), '[\x00-\x1f<>&"\\]', '', 'g')), 20), ''), 'My ship');
$$;

-- build a new ship: pays on the server, adds it to the player's ships and flies it
create or replace function public.custom_ship_create(p_id uuid, p_secret text, p_name text, p_spec jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; c bigint; g bigint; cc integer; gc integer; mx integer; v_id text; v_spec jsonb; v_name text;
begin
  perform public.ss_auth(p_id, p_secret);
  select custom_coins, custom_gems, custom_max into cc, gc, mx from public.shop_settings where id = 1;
  if (select count(*) from public.custom_ships where owner = p_id) >= mx then raise exception 'custom_limit'; end if;
  select coalesce(data, '{}'::jsonb) into d from public.profiles where id = p_id for update;
  c := coalesce((d->>'coins')::numeric, 0)::bigint; g := coalesce((d->>'gems')::numeric, 0)::bigint;
  if c < cc then raise exception 'not_enough_coins'; end if;
  if g < gc then raise exception 'not_enough_gems'; end if;
  v_spec := public.ss_custom_clean(p_spec); v_name := public.ss_custom_name(p_name);
  v_id := 'c-' || substr(md5(gen_random_uuid()::text), 1, 10);
  insert into public.custom_ships (id, owner, name, spec) values (v_id, p_id, v_name, v_spec);
  d := jsonb_set(d, '{ships}', coalesce(d->'ships', '["falcon"]'::jsonb) || to_jsonb(v_id));
  d := jsonb_set(d, '{skin}', to_jsonb(v_id));
  d := jsonb_set(jsonb_set(d, '{coins}', to_jsonb(c - cc)), '{gems}', to_jsonb(g - gc));
  update public.profiles set data = d, updated_at = now() where id = p_id;
  return jsonb_build_object('coins', d->'coins', 'gems', d->'gems', 'ships', d->'ships', 'skin', d->'skin',
    'ship', jsonb_build_object('id', v_id, 'name', v_name, 'spec', v_spec));
end $$;

-- repaint / rename a ship you built (free)
create or replace function public.custom_ship_update(p_id uuid, p_secret text, p_ship text, p_name text, p_spec jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.custom_ships;
begin
  perform public.ss_auth(p_id, p_secret);
  update public.custom_ships set name = public.ss_custom_name(p_name), spec = public.ss_custom_clean(p_spec), updated_at = now()
    where id = p_ship and owner = p_id returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  return jsonb_build_object('id', r.id, 'name', r.name, 'spec', r.spec);
end $$;

-- the look of any custom ships (so friends see your ship in a room and on your profile)
create or replace function public.custom_ships_get(p_ids text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'spec', s.spec)), '[]'::jsonb)
  from public.custom_ships s where s.id = any (p_ids[1:60]);
$$;

-- the ships you built, plus the price of a new one
create or replace function public.custom_ships_mine(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return jsonb_build_object(
    'coins', (select custom_coins from public.shop_settings where id = 1),
    'gems', (select custom_gems from public.shop_settings where id = 1),
    'max', (select custom_max from public.shop_settings where id = 1),
    'ships', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'spec', s.spec) order by s.created_at) from public.custom_ships s where s.owner = p_id), '[]'::jsonb));
end $$;

-- the shop catalog also tells the game the Workshop price
create or replace function public.shop_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'gem_rate', (select gem_rate from public.shop_settings where id = 1),
    'custom', (select jsonb_build_object('coins', custom_coins, 'gems', custom_gems, 'max', custom_max) from public.shop_settings where id = 1),
    'ships', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'sort', s.sort, 'price', s.price, 'gems', s.gems, 'secret', s.secret, 'world', s.world, 'coupon', s.coupon, 'invincible', s.invincible,
        'shape', s.shape, 'body', s.body, 'accent', s.accent, 'glow', s.glow, 'aura', s.aura, 'fx', s.fx, 'design', s.design,
        'gun', jsonb_build_object('rate', s.rate, 'dmg', s.dmg, 'side', s.side, 'style', s.style, 'pierce', s.pierce),
        'name', s.name, 'description', s.description, 'active', s.active) order by s.sort, s.id) from public.shop_ships s), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'id', i.id, 'sort', i.sort, 'costs', i.costs, 'gems', i.gems, 'active', i.active) order by i.kind, i.sort) from public.shop_items i), '[]'::jsonb));
$$;

revoke all on function public.ss_custom_clean(jsonb), public.ss_custom_name(text) from public, anon, authenticated;
revoke all on function public.custom_ship_create(uuid, text, text, jsonb), public.custom_ship_update(uuid, text, text, text, jsonb),
  public.custom_ships_get(text[]), public.custom_ships_mine(uuid, text) from public;
grant execute on function public.custom_ship_create(uuid, text, text, jsonb), public.custom_ship_update(uuid, text, text, text, jsonb),
  public.custom_ships_get(text[]), public.custom_ships_mine(uuid, text) to anon, authenticated;
