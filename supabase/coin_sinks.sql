-- SpaceShip: more ways to use coins and diamonds besides the shop.
--   Daily wheel      wheel_spin: one free spin a day (UTC), more spins for diamonds
--   Club treasury    club_donate / club_treasury: members give coins, the club levels up, every member gets more coins per game
--   Ship stars       ship_star: up to 3 stars per owned ship (stronger shots, stars around the ship)
--   Rare stickers    sticker_pack: a random rare sticker for the Workshop
--   Revive / Boss arena prices are sent to the game in shop_catalog().extras (played in the game itself)
-- All prices live in shop_settings and can be changed there.

alter table public.shop_settings
  add column if not exists wheel_gems integer not null default 5,
  add column if not exists star_coins integer[] not null default '{2000,5000,10000}',
  add column if not exists star_gems integer[] not null default '{10,25,50}',
  add column if not exists pack_gems integer not null default 15,
  add column if not exists revive_coins integer[] not null default '{50,100,200}',
  add column if not exists revive_gems integer[] not null default '{2,4,8}',
  add column if not exists arena_fee integer not null default 300,
  add column if not exists arena_coins integer not null default 1500,
  add column if not exists arena_gems integer not null default 5,
  add column if not exists club_levels integer[] not null default '{5000,20000,60000,150000,400000}';

-- ---------- the rare Workshop stickers ----------
create or replace function public.ss_rare_stickers() returns text[] language sql immutable set search_path = '' as $$
  select array['crown','planet','rocket','gem','ufo','moon','paw','anchor'];
$$;

create or replace function public.ss_custom_clean(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare out_st jsonb := '[]'::jsonb; st jsonb; k text; col text; n integer := 0; nimg integer := 0; img text;
  hex constant text := '^#[0-9a-fA-F]{6}$';
begin
  if p is null or jsonb_typeof(p) <> 'object' then p := '{}'::jsonb; end if;
  if jsonb_typeof(p->'stickers') = 'array' then
    for st in select * from jsonb_array_elements(p->'stickers') loop
      exit when n >= 10;
      continue when jsonb_typeof(st) <> 'object';
      k := st->>'k';
      continue when k is null or not (k = any (array['star','heart','bolt','dot','ring','stripe','play','diamond','flame','skull','wing','text','img'] || public.ss_rare_stickers()));
      -- a picture from the player's gallery: only a small png/webp/jpeg image, at most 2 per ship
      img := null;
      if k = 'img' then
        img := st->>'d';
        continue when nimg >= 2 or img is null or length(img) > 80000 or img !~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$';
        nimg := nimg + 1;
      end if;
      col := coalesce(st->>'c', '#ffffff'); if col !~ hex then col := '#ffffff'; end if;
      out_st := out_st || jsonb_build_object(
        'k', k,
        'x', greatest(-45, least(45, coalesce(case when jsonb_typeof(st->'x') = 'number' then (st->>'x')::numeric end, 0))),
        'y', greatest(-45, least(45, coalesce(case when jsonb_typeof(st->'y') = 'number' then (st->>'y')::numeric end, 0))),
        's', greatest(4, least(50, coalesce(case when jsonb_typeof(st->'s') = 'number' then (st->>'s')::numeric end, 12))),
        'r', greatest(-180, least(180, coalesce(case when jsonb_typeof(st->'r') = 'number' then (st->>'r')::numeric end, 0))),
        'c', col,
        't', case when k = 'text' then left(regexp_replace(coalesce(st->>'t', ''), '[<>&"\\]', '', 'g'), 4) else null end,
        'd', img);
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

-- rare stickers stay only if the player owns them (profiles.data.stickers)
create or replace function public.ss_custom_owned(p_spec jsonb, p_owned jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_set(p_spec, '{stickers}', coalesce((select jsonb_agg(s) from jsonb_array_elements(p_spec->'stickers') s
    where not (s->>'k' = any (public.ss_rare_stickers())) or coalesce(p_owned, '[]'::jsonb) ? (s->>'k')), '[]'::jsonb));
$$;

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
  v_spec := public.ss_custom_owned(public.ss_custom_clean(p_spec), d->'stickers'); v_name := public.ss_custom_name(p_name);
  v_id := 'c-' || substr(md5(gen_random_uuid()::text), 1, 10);
  insert into public.custom_ships (id, owner, name, spec) values (v_id, p_id, v_name, v_spec);
  d := jsonb_set(d, '{ships}', coalesce(d->'ships', '["falcon"]'::jsonb) || to_jsonb(v_id));
  d := jsonb_set(d, '{skin}', to_jsonb(v_id));
  d := jsonb_set(jsonb_set(d, '{coins}', to_jsonb(c - cc)), '{gems}', to_jsonb(g - gc));
  update public.profiles set data = d, updated_at = now() where id = p_id;
  return jsonb_build_object('coins', d->'coins', 'gems', d->'gems', 'ships', d->'ships', 'skin', d->'skin',
    'ship', jsonb_build_object('id', v_id, 'name', v_name, 'spec', v_spec));
end $$;

create or replace function public.custom_ship_update(p_id uuid, p_secret text, p_ship text, p_name text, p_spec jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.custom_ships; owned jsonb;
begin
  perform public.ss_auth(p_id, p_secret);
  select data->'stickers' into owned from public.profiles where id = p_id;
  update public.custom_ships set name = public.ss_custom_name(p_name), spec = public.ss_custom_owned(public.ss_custom_clean(p_spec), owned), updated_at = now()
    where id = p_ship and owner = p_id returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  return jsonb_build_object('id', r.id, 'name', r.name, 'spec', r.spec);
end $$;

-- a random rare sticker you don't have yet
create or replace function public.sticker_pack(p_id uuid, p_secret text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; g bigint; gc integer; owned jsonb; pick text;
begin
  perform public.ss_auth(p_id, p_secret);
  select pack_gems into gc from public.shop_settings where id = 1;
  select coalesce(data, '{}'::jsonb) into d from public.profiles where id = p_id for update;
  g := coalesce((d->>'gems')::numeric, 0)::bigint; owned := coalesce(d->'stickers', '[]'::jsonb);
  select k into pick from unnest(public.ss_rare_stickers()) k where not owned ? k order by random() limit 1;
  if pick is null then raise exception 'all_owned'; end if;
  if g < gc then raise exception 'not_enough_gems'; end if;
  d := jsonb_set(jsonb_set(d, '{stickers}', owned || to_jsonb(pick)), '{gems}', to_jsonb(g - gc));
  update public.profiles set data = d, updated_at = now() where id = p_id;
  return jsonb_build_object('sticker', pick, 'stickers', d->'stickers', 'gems', d->'gems');
end $$;

-- ---------- daily wheel ----------
-- 8 slices: 50 / 100 / 250 / 500 coins, 1 / 3 / 10 diamonds, a rare sticker (500 coins if you have them all)
create or replace function public.wheel_spin(p_id uuid, p_secret text, p_paid boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; c bigint; g bigint; wg integer; today text := (now() at time zone 'utc')::date::text; free boolean;
  r numeric; slot integer; w integer[] := array[22,20,14,7,15,10,3,9]; acc integer := 0; i integer; owned jsonb; st text; prize jsonb;
begin
  perform public.ss_auth(p_id, p_secret);
  select wheel_gems into wg from public.shop_settings where id = 1;
  select coalesce(data, '{}'::jsonb) into d from public.profiles where id = p_id for update;
  c := coalesce((d->>'coins')::numeric, 0)::bigint; g := coalesce((d->>'gems')::numeric, 0)::bigint;
  free := coalesce(d->>'wheel_day', '') <> today;
  if not free then
    if not p_paid then raise exception 'wheel_used'; end if;
    if g < wg then raise exception 'not_enough_gems'; end if;
    g := g - wg;
  else d := jsonb_set(d, '{wheel_day}', to_jsonb(today)); end if;
  r := floor(random() * 100);
  for i in 1..8 loop acc := acc + w[i]; if r < acc then slot := i - 1; exit; end if; end loop;
  slot := coalesce(slot, 0);
  if slot = 0 then c := c + 50; prize := '{"coins":50}';
  elsif slot = 1 then c := c + 100; prize := '{"coins":100}';
  elsif slot = 2 then c := c + 250; prize := '{"coins":250}';
  elsif slot = 3 then c := c + 500; prize := '{"coins":500}';
  elsif slot = 4 then g := g + 1; prize := '{"gems":1}';
  elsif slot = 5 then g := g + 3; prize := '{"gems":3}';
  elsif slot = 6 then g := g + 10; prize := '{"gems":10}';
  else
    owned := coalesce(d->'stickers', '[]'::jsonb);
    select k into st from unnest(public.ss_rare_stickers()) k where not owned ? k order by random() limit 1;
    if st is null then c := c + 500; prize := '{"coins":500}';
    else d := jsonb_set(d, '{stickers}', owned || to_jsonb(st)); prize := jsonb_build_object('sticker', st); end if;
  end if;
  d := jsonb_set(jsonb_set(d, '{coins}', to_jsonb(c)), '{gems}', to_jsonb(g));
  update public.profiles set data = d, updated_at = now() where id = p_id;
  return jsonb_build_object('slot', slot, 'prize', prize, 'free', free, 'coins', d->'coins', 'gems', d->'gems', 'stickers', coalesce(d->'stickers', '[]'::jsonb), 'wheel_day', d->'wheel_day');
end $$;

-- ---------- ship stars ----------
create or replace function public.ship_star(p_id uuid, p_secret text, p_ship text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; c bigint; g bigint; n integer; cc integer; gc integer;
begin
  perform public.ss_auth(p_id, p_secret);
  select coalesce(data, '{}'::jsonb) into d from public.profiles where id = p_id for update;
  if not coalesce(d->'ships', '["falcon"]'::jsonb) ? p_ship and p_ship <> 'falcon' then raise exception 'not_owned'; end if;
  n := coalesce((d->'stars'->>p_ship)::int, 0);
  if n >= 3 then raise exception 'maxed'; end if;
  select star_coins[n + 1], star_gems[n + 1] into cc, gc from public.shop_settings where id = 1;
  c := coalesce((d->>'coins')::numeric, 0)::bigint; g := coalesce((d->>'gems')::numeric, 0)::bigint;
  if c < cc then raise exception 'not_enough_coins'; end if;
  if g < gc then raise exception 'not_enough_gems'; end if;
  d := jsonb_set(d, '{stars}', coalesce(d->'stars', '{}'::jsonb) || jsonb_build_object(p_ship, n + 1));
  d := jsonb_set(jsonb_set(d, '{coins}', to_jsonb(c - cc)), '{gems}', to_jsonb(g - gc));
  update public.profiles set data = d, updated_at = now() where id = p_id;
  return jsonb_build_object('stars', d->'stars', 'coins', d->'coins', 'gems', d->'gems');
end $$;

-- ---------- club treasury ----------
alter table public.parties add column if not exists treasury bigint not null default 0;
create table if not exists public.club_donations (
  party_id uuid not null references public.parties(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  total bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (party_id, profile_id)
);
alter table public.club_donations enable row level security;

create or replace function public.ss_club_level(p_treasury bigint) returns integer
language sql stable set search_path = '' as $$
  select coalesce((select count(*)::int from unnest((select club_levels from public.shop_settings where id = 1)) l where p_treasury >= l), 0);
$$;

create or replace function public.club_treasury(p_id uuid, p_secret text, p_party uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tr bigint; lv integer; lvls integer[];
begin
  perform public.ss_auth(p_id, p_secret);
  if not exists (select 1 from public.party_members where party_id = p_party and profile_id = p_id) then raise exception 'not_allowed'; end if;
  select treasury into tr from public.parties where id = p_party;
  select club_levels into lvls from public.shop_settings where id = 1;
  lv := public.ss_club_level(tr);
  return jsonb_build_object('treasury', tr, 'level', lv, 'levels', to_jsonb(lvls), 'next', case when lv < array_length(lvls, 1) then lvls[lv + 1] end,
    'mine', coalesce((select total from public.club_donations where party_id = p_party and profile_id = p_id), 0),
    'top', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', p.id, 'handle', p.handle, 'name', p.name, 'avatar', p.avatar, 'total', d.total) x
       from public.club_donations d join public.profiles p on p.id = d.profile_id where d.party_id = p_party order by d.total desc limit 10) q), '[]'::jsonb));
end $$;

create or replace function public.club_donate(p_id uuid, p_secret text, p_party uuid, p_coins integer) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; c bigint;
begin
  perform public.ss_auth(p_id, p_secret);
  if p_coins is null or p_coins < 10 then raise exception 'bad_amount'; end if;
  if not exists (select 1 from public.party_members where party_id = p_party and profile_id = p_id) then raise exception 'not_allowed'; end if;
  select coalesce(data, '{}'::jsonb) into d from public.profiles where id = p_id for update;
  c := coalesce((d->>'coins')::numeric, 0)::bigint;
  if c < p_coins then raise exception 'not_enough_coins'; end if;
  d := jsonb_set(d, '{coins}', to_jsonb(c - p_coins));
  update public.profiles set data = d, updated_at = now() where id = p_id;
  update public.parties set treasury = treasury + p_coins where id = p_party;
  insert into public.club_donations (party_id, profile_id, total) values (p_party, p_id, p_coins)
    on conflict (party_id, profile_id) do update set total = public.club_donations.total + excluded.total, updated_at = now();
  return public.club_treasury(p_id, p_secret, p_party) || jsonb_build_object('coins', d->'coins');
end $$;

-- ---------- the catalog tells the game all these prices ----------
create or replace function public.shop_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'gem_rate', (select gem_rate from public.shop_settings where id = 1),
    'custom', (select jsonb_build_object('coins', custom_coins, 'gems', custom_gems, 'max', custom_max) from public.shop_settings where id = 1),
    'extras', (select jsonb_build_object('wheel_gems', wheel_gems, 'star_coins', star_coins, 'star_gems', star_gems, 'pack_gems', pack_gems,
        'revive_coins', revive_coins, 'revive_gems', revive_gems, 'arena_fee', arena_fee, 'arena_coins', arena_coins, 'arena_gems', arena_gems, 'club_levels', club_levels)
      from public.shop_settings where id = 1),
    'ships', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'sort', s.sort, 'price', s.price, 'gems', s.gems, 'secret', s.secret, 'world', s.world, 'coupon', s.coupon, 'invincible', s.invincible,
        'shape', s.shape, 'body', s.body, 'accent', s.accent, 'glow', s.glow, 'aura', s.aura, 'fx', s.fx, 'design', s.design,
        'gun', jsonb_build_object('rate', s.rate, 'dmg', s.dmg, 'side', s.side, 'style', s.style, 'pierce', s.pierce),
        'name', s.name, 'description', s.description, 'active', s.active) order by s.sort, s.id) from public.shop_ships s), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'id', i.id, 'sort', i.sort, 'costs', i.costs, 'gems', i.gems, 'active', i.active) order by i.kind, i.sort) from public.shop_items i), '[]'::jsonb));
$$;

revoke all on function public.ss_rare_stickers(), public.ss_custom_owned(jsonb, jsonb), public.ss_club_level(bigint) from public, anon, authenticated;
revoke all on function public.sticker_pack(uuid, text), public.wheel_spin(uuid, text, boolean), public.ship_star(uuid, text, text),
  public.club_treasury(uuid, text, uuid), public.club_donate(uuid, text, uuid, integer) from public;
grant execute on function public.sticker_pack(uuid, text), public.wheel_spin(uuid, text, boolean), public.ship_star(uuid, text, text),
  public.club_treasury(uuid, text, uuid), public.club_donate(uuid, text, uuid, integer) to anon, authenticated;
