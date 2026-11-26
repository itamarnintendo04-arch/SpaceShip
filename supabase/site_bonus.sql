-- Website bonuses.
--   coupons.site = true: the code is shown on the website ("bonus for joining"). It is NOT in the game's free gifts list;
--                        players type it in Codes & gifts. The website reads them with site_coupons().
--   VOYAGER: the code behind the website's "open the app" link (com.spaceship.game://gift?code=VOYAGER) - it gives the Voyager ship.
alter table public.coupons add column if not exists site boolean not null default false;

create or replace function public.site_coupons() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'coins', c.coins, 'gems', c.gems, 'ship', c.ship, 'world', c.world, 'note', c.note, 'expires_at', c.expires_at) order by c.created_at), '[]'::jsonb)
  from public.coupons c
  where c.site and c.active and (c.starts_at is null or c.starts_at <= now()) and (c.expires_at is null or c.expires_at > now()) and (c.max_uses is null or c.uses < c.max_uses);
$$;
revoke all on function public.site_coupons() from public;
grant execute on function public.site_coupons() to anon, authenticated;

insert into public.coupons (code, coins, gems, site, note) values ('JOINBONUS', 1000, 15, true, 'Bonus for joining SpaceShip')
on conflict (code) do nothing;
insert into public.coupons (code, coins, gems, ship, note) values ('VOYAGER', 0, 0, 'voyager', 'The website''s ship: Voyager')
on conflict (code) do nothing;

insert into public.shop_ships (id, sort, price, gems, secret, world, coupon, shape, body, accent, glow, aura, fx, rate, dmg, side, style, pierce, name)
values ('voyager', 244, 0, 0, true, null, true, 'crystal', '#e0f2fe', '#1d4ed8', '#38bdf8', 'trail', 'cosmic', 2, 4, 4, 'comet', true, '{"en": "Voyager", "he": "מגלה"}')
on conflict (id) do nothing;
