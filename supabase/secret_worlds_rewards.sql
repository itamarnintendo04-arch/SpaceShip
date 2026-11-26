-- Coupons and secret tokens can give a secret world (w1 ... w20) in addition to coins, diamonds and ships.
-- coupons.world / secret_tokens.world: the id of the secret world (w1 = the first one in the game's list).
alter table public.coupons add column if not exists world text check (world is null or world ~ '^w([1-9]|1[0-9]|20)$');
alter table public.secret_tokens alter column ship drop not null;
alter table public.secret_tokens add column if not exists world text check (world is null or world ~ '^w([1-9]|1[0-9]|20)$');
alter table public.secret_tokens drop constraint if exists secret_tokens_reward_check;
alter table public.secret_tokens add constraint secret_tokens_reward_check check (ship is not null or world is not null);

create or replace function public.redeem_coupon(p_id uuid, p_secret text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v public.coupons; v_data jsonb;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v from public.coupons where upper(code) = upper(trim(coalesce(p_code, ''))) for update;
  if v.code is null or not v.active then raise exception 'coupon_not_found'; end if;
  if v.personal and not exists (select 1 from public.gift_unlocks u where u.code = v.code and u.profile_id = p_id) then raise exception 'coupon_not_found'; end if;
  if v.starts_at is not null and now() < v.starts_at then raise exception 'coupon_not_found'; end if;
  if v.expires_at is not null and now() > v.expires_at then raise exception 'coupon_expired'; end if;
  if exists (select 1 from public.coupon_redemptions where code = v.code and profile_id = p_id) then raise exception 'coupon_used'; end if;
  if v.max_uses is not null and v.uses >= v.max_uses then raise exception 'coupon_used_up'; end if;
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
  return coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'coins', c.coins, 'gems', c.gems, 'ship', c.ship, 'world', c.world, 'note', c.note, 'expires_at', c.expires_at, 'personal', c.personal) order by c.personal desc, c.created_at desc)
    from public.coupons c
    where c.active
      and (c.is_gift or (c.personal and exists (select 1 from public.gift_unlocks u where u.code = c.code and u.profile_id = p_id)))
      and (c.starts_at is null or c.starts_at <= now()) and (c.expires_at is null or c.expires_at > now())
      and (c.max_uses is null or c.uses < c.max_uses)
      and not exists (select 1 from public.coupon_redemptions r where r.code = c.code and r.profile_id = p_id)), '[]'::jsonb);
end $$;

-- the game shows what the token gives before signing in: a ship id, or a secret world id (w1..w20)
create or replace function public.check_secret_token(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(t.ship, t.world) from public.secret_tokens t
  where t.token = upper(trim(coalesce(p_token, ''))) and t.active and (t.max_uses is null or t.uses < t.max_uses);
$$;

create or replace function public.claim_secret_token(p_id uuid, p_secret text, p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v public.secret_tokens; d jsonb;
begin
  perform public.ss_auth(p_id, p_secret);
  select * into v from public.secret_tokens where token = upper(trim(coalesce(p_token, ''))) for update;
  if v.token is null or not v.active or (v.max_uses is not null and v.uses >= v.max_uses) then raise exception 'token_not_found'; end if;
  if exists (select 1 from public.secret_token_claims where token = v.token and profile_id = p_id) then return jsonb_build_object('ship', v.ship, 'world', v.world, 'already', true); end if;
  insert into public.secret_token_claims(token, profile_id) values (v.token, p_id);
  update public.secret_tokens set uses = uses + 1 where token = v.token;
  select coalesce(data, '{}'::jsonb) into d from public.profiles where id = p_id for update;
  if v.ship is not null then
    if not coalesce(d->'ships', '[]'::jsonb) ? v.ship then d := jsonb_set(d, '{ships}', coalesce(d->'ships', '["falcon"]'::jsonb) || to_jsonb(v.ship)); end if;
    d := jsonb_set(d, '{skin}', to_jsonb(v.ship));
  end if;
  if v.world is not null and not coalesce(d->'worlds', '[]'::jsonb) ? v.world then
    d := jsonb_set(d, '{worlds}', coalesce(d->'worlds', '[]'::jsonb) || to_jsonb(v.world));
  end if;
  update public.profiles set data = d, updated_at = now() where id = p_id;
  return jsonb_build_object('ship', v.ship, 'world', v.world, 'already', false);
end $$;

revoke all on function public.redeem_coupon(uuid, text, text), public.free_gifts(uuid, text), public.check_secret_token(text), public.claim_secret_token(uuid, text, text) from public;
grant execute on function public.redeem_coupon(uuid, text, text), public.free_gifts(uuid, text), public.check_secret_token(text), public.claim_secret_token(uuid, text, text) to anon, authenticated;
