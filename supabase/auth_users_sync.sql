-- Every SpaceShip player is also listed in Supabase -> Authentication -> Users, with the same id as in the game.
-- Players with an email show it (confirmed: it was verified with a code); players without one have no email there.
-- The display name is "@handle · name". The rows have no password, so nobody can sign in through Supabase Auth with them;
-- the game keeps signing in with its own login keys. Kept in sync by a trigger: new players, email / name / handle /
-- avatar changes, and deleted players.
create or replace function public.ss_sync_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_meta jsonb;
begin
  if tg_op = 'DELETE' then
    delete from auth.users where id = old.id;
    return old;
  end if;
  v_email := nullif(lower(trim(new.email)), '');
  -- never clash with another auth user that already uses this email
  if v_email is not null and exists (select 1 from auth.users u where lower(u.email) = v_email and u.id <> new.id) then v_email := null; end if;
  v_meta := jsonb_build_object('handle', new.handle, 'name', new.name, 'display_name', '@' || new.handle || ' · ' || new.name, 'full_name', new.name, 'avatar', new.avatar);
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, is_anonymous, is_sso_user,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', new.id, 'authenticated', 'authenticated', v_email, case when v_email is not null then now() end,
          jsonb_build_object('provider', 'spaceship', 'providers', jsonb_build_array('spaceship')), v_meta,
          coalesce(new.created_at, now()), now(), false, false, '', '', '', '', '', '')
  on conflict (id) do update set
    email = excluded.email,
    email_confirmed_at = case when excluded.email is null then null else coalesce(auth.users.email_confirmed_at, now()) end,
    raw_user_meta_data = coalesce(auth.users.raw_user_meta_data, '{}'::jsonb) || excluded.raw_user_meta_data,
    updated_at = now();
  return new;
end $$;

drop trigger if exists ss_sync_auth_user on public.profiles;
create trigger ss_sync_auth_user after insert or update of email, name, handle, avatar or delete on public.profiles
  for each row execute function public.ss_sync_auth_user();

revoke all on function public.ss_sync_auth_user() from public, anon, authenticated;

-- add the players who already exist
update public.profiles set email = email;
