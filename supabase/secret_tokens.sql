-- Secret tokens: typed in the game's "Sign in with a login key" field (they start with SST-).
-- The token's ship is added to the account that signs in. Tokens live in public.secret_tokens (add / turn off rows there).
-- Also: the Immortal ship (aegis) in the shop table, with the new invincible flag.
create table if not exists public.secret_tokens (
  token text primary key check (token ~ '^SST-[A-Z0-9-]{8,64}$'),
  ship text not null,
  active boolean not null default true,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);
alter table public.secret_tokens enable row level security;
create table if not exists public.secret_token_claims (
  token text not null references public.secret_tokens(token) on update cascade on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (token, profile_id)
);
alter table public.secret_token_claims enable row level security;

-- is the token valid? returns its ship (or null). No sign-in needed: the player checks it before signing in.
create or replace function public.check_secret_token(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select t.ship from public.secret_tokens t
  where t.token = upper(trim(coalesce(p_token, ''))) and t.active and (t.max_uses is null or t.uses < t.max_uses);
$$;

-- give the token's ship to the signed-in player (once per player)
create or replace function public.claim_secret_token(p_id uuid, p_secret text, p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v public.secret_tokens; d jsonb;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v from public.secret_tokens where token = upper(trim(coalesce(p_token, ''))) for update;
  if v.token is null or not v.active or (v.max_uses is not null and v.uses >= v.max_uses) then raise exception 'token_not_found'; end if;
  if exists (select 1 from public.secret_token_claims where token = v.token and profile_id = p_id) then return jsonb_build_object('ship', v.ship, 'already', true); end if;
  insert into public.secret_token_claims(token, profile_id) values (v.token, p_id);
  update public.secret_tokens set uses = uses + 1 where token = v.token;
  select coalesce(data, '{}'::jsonb) into d from public.profiles where id = p_id for update;
  if not coalesce(d->'ships', '[]'::jsonb) ? v.ship then
    d := jsonb_set(d, '{ships}', coalesce(d->'ships', '["falcon"]'::jsonb) || to_jsonb(v.ship));
  end if;
  d := jsonb_set(d, '{skin}', to_jsonb(v.ship));
  update public.profiles set data = d, updated_at = now() where id = p_id;
  return jsonb_build_object('ship', v.ship, 'already', false);
end $$;

revoke all on function public.check_secret_token(text), public.claim_secret_token(uuid, text, text) from public;
grant execute on function public.check_secret_token(text), public.claim_secret_token(uuid, text, text) to anon, authenticated;

-- the shop table learns the new parts and the invincible flag
alter table public.shop_ships add column if not exists invincible boolean not null default false;
alter table public.shop_ships drop constraint if exists shop_ships_shape_check, drop constraint if exists shop_ships_aura_check, drop constraint if exists shop_ships_style_check;
alter table public.shop_ships add constraint shop_ships_shape_check check (shape in ('arrow','delta','saucer','twin','stealth','phoenix','crystal','dragon','titan','nova','cosmos','chaos','aegis')),
  add constraint shop_ships_aura_check check (aura in ('pulse','sparks','spin','cloak','embers','shine','prism','trail','orbit','storm','galaxy','lightning','aegis')),
  add constraint shop_ships_style_check check (style in ('line','needle','flame','ring','twin','laser','fireball','star','comet','nebula','beam','vortex','wisp','shard','rainbow','void','aurora','supernova','rock','snow','magma','eclipse','cosmic','chaos','holy'));
insert into public.shop_ships (id, sort, price, gems, secret, world, coupon, invincible, shape, body, accent, glow, aura, fx, rate, dmg, side, style, pierce)
values ('aegis', 245, 0, 0, true, null, true, true, 'aegis', '#f8fafc', '#ca8a04', '#fde047', 'aegis', null, 2.4, 5.5, 6, 'holy', true)
on conflict (id) do nothing;

create or replace function public.shop_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'gem_rate', (select gem_rate from public.shop_settings where id = 1),
    'ships', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'sort', s.sort, 'price', s.price, 'gems', s.gems, 'secret', s.secret, 'world', s.world, 'coupon', s.coupon, 'invincible', s.invincible,
        'shape', s.shape, 'body', s.body, 'accent', s.accent, 'glow', s.glow, 'aura', s.aura, 'fx', s.fx,
        'gun', jsonb_build_object('rate', s.rate, 'dmg', s.dmg, 'side', s.side, 'style', s.style, 'pierce', s.pierce),
        'name', s.name, 'description', s.description, 'active', s.active) order by s.sort, s.id) from public.shop_ships s), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'id', i.id, 'sort', i.sort, 'costs', i.costs, 'gems', i.gems, 'active', i.active) order by i.kind, i.sort) from public.shop_items i), '[]'::jsonb));
$$;
revoke all on function public.shop_catalog() from public;
grant execute on function public.shop_catalog() to anon, authenticated;

-- tokens match by their letters and digits only, so dashes, spaces or odd characters copied with them don't matter
create or replace function public.ss_token_norm(p text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g');
$$;
-- check_secret_token / claim_secret_token compare ss_token_norm(token) = ss_token_norm(p_token) (see migration secret_tokens_forgiving_match)
