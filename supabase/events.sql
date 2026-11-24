-- Live events, run from the server.
-- Add a row to public.game_events (Supabase → Table Editor → game_events) and every player sees it
-- in the game within a few minutes, with no new build:
--   title, body     text shown on the event banner in the main menu (write it in English, or any language)
--   coins_mult      coin multiplier while the event runs, e.g. 2 = double coins (1 = no change, max 10)
--   gems_per_win    extra diamonds for every level won while the event runs (0 = none)
--   starts_at       when it starts (default: now)        ends_at   when it ends (required)
--   color           banner color, e.g. #f59e0b
--   active          untick to stop it early
-- Several events can run at once: the highest multiplier wins and diamonds add up.

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 60),
  body text check (char_length(body) <= 200),
  coins_mult numeric(4,2) not null default 1 check (coins_mult between 1 and 10),
  gems_per_win integer not null default 0 check (gems_per_win between 0 and 100),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  color text not null default '#8b5cf6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.game_events enable row level security;

-- events running now and the next ones starting within a day (so the game can count down to them)
create or replace function public.active_events() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'body', e.body, 'coins_mult', e.coins_mult,
    'gems_per_win', e.gems_per_win, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'color', e.color) order by e.starts_at), '[]'::jsonb)
  from public.game_events e
  where e.active and e.ends_at > now() and e.starts_at < now() + interval '1 day';
$$;

revoke all on function public.active_events() from public;
grant execute on function public.active_events() to anon, authenticated;
