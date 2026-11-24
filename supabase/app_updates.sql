-- Asking players to update the app, only for big events. Run from the server.
-- Supabase → Table Editor:
--   game_events.min_version
--     a big event that needs new app content: a version (e.g. 1.1.26), or latest = the newest build on GitHub. Players on an older app get a pop-up asking them to
--     update (once per event) and an "Update to join" button on the event banner. They get no bonus from that
--     event until they update. Events without min_version never ask anyone to update.
--   app_config (one row)
--     site_url        your download website (e.g. https://spaceship-game.vercel.app). The Update button takes the
--                     right file for the device from it, including the signed iPhone link (IOS_DOWNLOAD_URL).
--                     Empty = the latest GitHub release.
--     update_message  optional text shown in the update window.
-- The version of each build is 1.1.<build number> (shown on the GitHub release, e.g. release-25 = 1.1.25).

create table if not exists public.app_config (
  id integer primary key default 1 check (id = 1),
  site_url text check (site_url is null or site_url ~ '^https://'),
  update_message text check (char_length(update_message) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
insert into public.app_config (id) values (1) on conflict (id) do nothing;
alter table public.app_config drop column if exists min_version, drop column if exists latest_version;

alter table public.game_events add column if not exists min_version text;
-- a version like 1.1.27, or 'latest' = the newest build on GitHub
alter table public.game_events drop constraint if exists game_events_min_version_check;
alter table public.game_events add constraint game_events_min_version_check
  check (min_version is null or min_version = 'latest' or min_version ~ '^\d+(\.\d+){0,3}$');

-- everything the game needs at start: the update settings + running/upcoming events
create or replace function public.app_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'site_url', c.site_url, 'update_message', c.update_message,
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'body', e.body, 'coins_mult', e.coins_mult,
        'gems_per_win', e.gems_per_win, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'color', e.color, 'min_version', e.min_version) order by e.starts_at)
      from public.game_events e where e.active and e.ends_at > now() and e.starts_at < now() + interval '1 day'), '[]'::jsonb))
  from public.app_config c where c.id = 1;
$$;

revoke all on function public.app_info() from public;
grant execute on function public.app_info() to anon, authenticated;
