-- SpaceShip: the coupon maker on the website's /dev page (repository admins only).
-- The /dev page checks the GitHub admin, then the Vercel function calls these with SS_DEV_KEY (a Vercel env var).
-- Only the sha256 of that key is kept here (dev_keys), so the database never holds the key itself.
--
-- A coupon can give: coins, diamonds, one or more existing ships (ships), and a newly designed ship (design):
-- every player who redeems it gets their own copy of the designed ship (a custom ship, id "c-...").
-- Access ("who can use it"), the only thing editable after creating, together with the players:
--   code    - anyone who types the code
--   gift    - shows up for everyone in Codes & gifts
--   players - only the chosen players (it shows up in their Codes & gifts, with the message)
--   off     - nobody
-- Chosen players always get it in their Codes & gifts, whatever the access.

alter table public.coupons add column if not exists ships text[];
alter table public.coupons add column if not exists design jsonb;
alter table public.coupons add column if not exists design_name text;

create table if not exists public.dev_keys (hash text primary key, created_at timestamptz not null default now());
alter table public.dev_keys enable row level security;   -- no policies: nobody reads it from outside

create or replace function public.ss_dev_auth(p_key text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_key is null or length(p_key) < 32
     or not exists (select 1 from public.dev_keys where hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    raise exception 'dev_denied';
  end if;
end $$;

create or replace function public.ss_coupon_access(c public.coupons) returns text
language sql immutable set search_path = '' as $$
  select case when not c.active then 'off' when c.is_gift then 'gift' when c.personal then 'players' else 'code' end;
$$;

-- every coupon (newest first) with its players, and the players to choose from
create or replace function public.dev_coupons(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_dev_auth(p_key);
  return jsonb_build_object(
    'coupons', coalesce((select jsonb_agg(jsonb_build_object(
        'code', c.code, 'coins', c.coins, 'gems', c.gems, 'ship', c.ship, 'ships', to_jsonb(c.ships), 'world', c.world,
        'design', c.design, 'design_name', c.design_name, 'note', c.note, 'uses', c.uses, 'max_uses', c.max_uses,
        'created_at', c.created_at, 'access', public.ss_coupon_access(c),
        'players', coalesce((select jsonb_agg(g.handle order by g.granted_at) from public.coupon_grants g where g.code = c.code), '[]'::jsonb),
        'redeemed', coalesce((select jsonb_agg(p.handle) from public.coupon_redemptions r join public.profiles p on p.id = r.profile_id where r.code = c.code), '[]'::jsonb))
      order by c.created_at desc) from public.coupons c), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object('handle', p.handle, 'name', p.name, 'avatar', p.avatar) order by p.created_at) from public.profiles p), '[]'::jsonb));
end $$;

create or replace function public.ss_dev_set_players(p_code text, p_handles text[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare h text; v_note text;
begin
  select note into v_note from public.coupons where code = p_code;
  p_handles := array(select distinct lower(ltrim(trim(x), '@')) from unnest(coalesce(p_handles, '{}')) x where trim(x) <> '');
  foreach h in array p_handles loop
    if not exists (select 1 from public.profiles where lower(handle) = h) then raise exception 'no_player:%', h; end if;
  end loop;
  delete from public.coupon_grants g where g.code = p_code and not (lower(g.handle) = any (p_handles));
  insert into public.coupon_grants (code, handle, note)
    select p_code, u.x, v_note from unnest(p_handles) as u(x)
    where not exists (select 1 from public.coupon_grants g where g.code = p_code and lower(g.handle) = u.x);
end $$;

create or replace function public.dev_coupon_create(p_key text, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_code text; v_access text; v_ships text[]; v_design jsonb; v_coins bigint; v_gems bigint; v_max integer; v_note text;
begin
  perform public.ss_dev_auth(p_key);
  v_code := upper(trim(coalesce(p->>'code', '')));
  if v_code !~ '^[A-Z0-9_-]{2,32}$' then raise exception 'bad_code'; end if;
  if exists (select 1 from public.coupons where upper(code) = v_code) then raise exception 'code_taken'; end if;
  v_access := coalesce(p->>'access', 'code');
  if v_access not in ('code', 'gift', 'players', 'off') then raise exception 'bad_access'; end if;
  v_coins := coalesce((p->>'coins')::numeric, 0)::bigint; v_gems := coalesce((p->>'gems')::numeric, 0)::bigint;
  if v_coins < 0 or v_gems < 0 or v_coins > 1000000000000000 or v_gems > 1000000000000000 then raise exception 'bad_amount'; end if;
  v_ships := array(select distinct x from jsonb_array_elements_text(coalesce(p->'ships', '[]'::jsonb)) x where x ~ '^[a-z0-9_-]{1,32}$' and x not like 'c-%' limit 60);
  if jsonb_typeof(p->'design') = 'object' then v_design := public.ss_custom_clean(p->'design'); end if;
  v_max := case when jsonb_typeof(p->'max_uses') = 'number' and (p->>'max_uses')::integer > 0 then (p->>'max_uses')::integer end;
  v_note := nullif(left(trim(coalesce(p->>'note', '')), 300), '');
  if v_coins = 0 and v_gems = 0 and cardinality(v_ships) = 0 and v_design is null then raise exception 'empty_coupon'; end if;
  insert into public.coupons (code, coins, gems, ship, ships, design, design_name, max_uses, active, is_gift, personal, site, note)
  values (v_code, v_coins, v_gems, v_ships[1], nullif(v_ships, '{}'), v_design,
          case when v_design is not null then public.ss_custom_name(p->>'design_name') end, v_max,
          v_access <> 'off', v_access = 'gift', v_access = 'players', false, v_note);
  perform public.ss_dev_set_players(v_code, array(select jsonb_array_elements_text(coalesce(p->'players', '[]'::jsonb))));
  return jsonb_build_object('code', v_code);
end $$;

-- after creating, only who can use it (access) and the players can change
create or replace function public.dev_coupon_update(p_key text, p_code text, p_access text, p_players text[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ss_dev_auth(p_key);
  if p_access not in ('code', 'gift', 'players', 'off') then raise exception 'bad_access'; end if;
  update public.coupons set active = p_access <> 'off', is_gift = p_access = 'gift', personal = p_access = 'players' where code = p_code;
  if not found then raise exception 'coupon_not_found'; end if;
  perform public.ss_dev_set_players(p_code, p_players);
  return jsonb_build_object('code', p_code, 'access', p_access);
end $$;

-- redeem: now also every ship in "ships", and a copy of the designed ship for the player
create or replace function public.redeem_coupon(p_id uuid, p_secret text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.coupons; v_data jsonb; g public.coupon_grants; s text; v_all text[]; v_custom jsonb; v_cid text;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v from public.coupons where upper(code) = upper(trim(coalesce(p_code, ''))) for update;
  if v.code is null then raise exception 'coupon_not_found'; end if;
  select * into g from public.coupon_grants where code = v.code and profile_id = p_id;
  if exists (select 1 from public.coupon_redemptions where code = v.code and profile_id = p_id) then raise exception 'coupon_used'; end if;
  if g.code is not null then
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
  v_all := array(select distinct x from unnest(array_remove(array[v.ship] || coalesce(v.ships, '{}'), null)) x);
  foreach s in array v_all loop
    if not coalesce(v_data->'ships', '[]'::jsonb) ? s then
      v_data := jsonb_set(v_data, '{ships}', coalesce(v_data->'ships', '["falcon"]'::jsonb) || to_jsonb(s));
    end if;
  end loop;
  if v.design is not null then
    v_cid := 'c-' || substr(md5(gen_random_uuid()::text), 1, 10);
    insert into public.custom_ships (id, owner, name, spec) values (v_cid, p_id, coalesce(v.design_name, 'Gift ship'), v.design);
    v_data := jsonb_set(v_data, '{ships}', coalesce(v_data->'ships', '["falcon"]'::jsonb) || to_jsonb(v_cid));
    v_custom := jsonb_build_object('id', v_cid, 'name', coalesce(v.design_name, 'Gift ship'), 'spec', v.design);
  end if;
  if v.world is not null and not coalesce(v_data->'worlds', '[]'::jsonb) ? v.world then
    v_data := jsonb_set(v_data, '{worlds}', coalesce(v_data->'worlds', '[]'::jsonb) || to_jsonb(v.world));
  end if;
  update public.profiles set data = v_data, updated_at = now() where id = p_id;
  return jsonb_build_object('code', v.code, 'coins', v.coins, 'gems', v.gems, 'ship', v.ship, 'ships', to_jsonb(v_all), 'custom', v_custom,
                            'world', v.world, 'note', coalesce(g.note, v.note));
end $$;

-- the gift list: also the extra ships and the designed ship (to show them before claiming)
create or replace function public.free_gifts(p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.ss_auth(p_id, p_secret);
  return coalesce((select jsonb_agg(x order by (x->>'personal')::boolean desc, x->>'at' desc) from (
    select jsonb_build_object('code', c.code, 'coins', c.coins, 'gems', c.gems, 'ship', c.ship, 'ships', to_jsonb(c.ships), 'world', c.world,
                              'design', case when c.design is not null then jsonb_build_object('name', c.design_name, 'spec', c.design) end,
                              'note', coalesce(g.note, c.note), 'expires_at', g.expires_at, 'personal', true, 'at', g.granted_at) x
    from public.coupon_grants g join public.coupons c on c.code = g.code
    where g.profile_id = p_id and (g.expires_at is null or g.expires_at > now())
      and not exists (select 1 from public.coupon_redemptions r where r.code = c.code and r.profile_id = p_id)
    union all
    select jsonb_build_object('code', c.code, 'coins', c.coins, 'gems', c.gems, 'ship', c.ship, 'ships', to_jsonb(c.ships), 'world', c.world,
                              'design', case when c.design is not null then jsonb_build_object('name', c.design_name, 'spec', c.design) end,
                              'note', c.note, 'expires_at', c.expires_at, 'personal', c.personal, 'at', c.created_at)
    from public.coupons c
    where c.active
      and (c.is_gift or (c.personal and exists (select 1 from public.gift_unlocks u where u.code = c.code and u.profile_id = p_id)))
      and (c.starts_at is null or c.starts_at <= now()) and (c.expires_at is null or c.expires_at > now())
      and (c.max_uses is null or c.uses < c.max_uses)
      and not exists (select 1 from public.coupon_grants g where g.code = c.code and g.profile_id = p_id)
      and not exists (select 1 from public.coupon_redemptions r where r.code = c.code and r.profile_id = p_id)
  ) s), '[]'::jsonb);
end $$;

revoke all on function public.ss_dev_auth(text), public.ss_dev_set_players(text, text[]) from public, anon, authenticated;
grant execute on function public.dev_coupons(text), public.dev_coupon_create(text, jsonb), public.dev_coupon_update(text, text, text, text[]) to anon;

-- The key: the Vercel function derives it from GITHUB_CLIENT_SECRET (HMAC), so no extra env var is needed
-- (SS_DEV_KEY in Vercel, when set, is used instead). It is registered once with dev_key_claim, and only while
-- a 'pending' row is open (put there by hand, for 2 hours). If a key is already registered, claiming is refused,
-- so a successful claim from the website proves the website's key is the only one.
-- To change the key (e.g. a new GitHub client secret): delete from dev_keys; insert into dev_keys(hash) values ('pending');
-- then open https://spaceship-site.vercel.app/api/dev/claim once.
create or replace function public.dev_key_claim(p_key text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_key is null or length(p_key) < 32 then raise exception 'bad_key'; end if;
  if exists (select 1 from public.dev_keys where hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then return true; end if;
  if exists (select 1 from public.dev_keys where hash <> 'pending') then raise exception 'already_claimed'; end if;
  if not exists (select 1 from public.dev_keys where hash = 'pending' and created_at > now() - interval '2 hours') then raise exception 'claim_closed'; end if;
  delete from public.dev_keys;
  insert into public.dev_keys(hash) values (encode(sha256(convert_to(p_key, 'UTF8')), 'hex'));
  return true;
end $$;
grant execute on function public.dev_key_claim(text) to anon;
