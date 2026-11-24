-- Asking players to update the app, run from the server.
-- Supabase → Table Editor:
--   app_config (one row)
--     min_version     players below this version MUST update before they can play (e.g. 1.1.24). Empty = nobody is forced.
--     latest_version  players below this version are told an update is available (they can skip it). Empty = no reminder.
--     site_url        your download website (e.g. https://spaceship-game.vercel.app). The Update button takes the
--                     right file for the device from it, including the signed iPhone link (IOS_DOWNLOAD_URL).
--                     Empty = the GitHub releases page.
--     update_message  optional text shown in the update window.
--   game_events.min_version
--     a big event that needs new app content: players below this version see "Update to join"
--     and get a pop-up asking them to update; they get no bonus from that event until they do.
-- The version of each build is 1.1.<build number> (shown on the GitHub release, e.g. release-24 = 1.1.24).

create table if not exists public.app_config (
  id integer primary key default 1 check (id = 1),
  min_version text check (min_version is null or min_version ~ '^\d+(\.\d+){0,3}$'),
  latest_version text check (latest_version is null or latest_version ~ '^\d+(\.\d+){0,3}$'),
  site_url text check (site_url is null or site_url ~ '^https://'),
  update_message text check (char_length(update_message) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.game_events add column if not exists min_version text
  check (min_version is null or min_version ~ '^\d+(\.\d+){0,3}$');

-- everything the game needs at start: update settings + running/upcoming events
create or replace function public.app_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'min_version', c.min_version, 'latest_version', c.latest_version, 'site_url', c.site_url, 'update_message', c.update_message,
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'body', e.body, 'coins_mult', e.coins_mult,
        'gems_per_win', e.gems_per_win, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'color', e.color, 'min_version', e.min_version) order by e.starts_at)
      from public.game_events e where e.active and e.ends_at > now() and e.starts_at < now() + interval '1 day'), '[]'::jsonb))
  from public.app_config c where c.id = 1;
$$;

revoke all on function public.app_info() from public;
grant execute on function public.app_info() to anon, authenticated;
