-- Sign in with Google (Supabase Auth of this project, provider "google").
-- The game keeps its own players (profiles); a Google account is linked to one player through profiles.google_id.
-- The game signs in to Google with Supabase Auth, then calls these functions with that session (auth.uid() = the Google user).
--   google_login()                      -> the linked player (a new game session), or { new: true, email } for a new Google account
--   google_register(handle, name, ava)  -> creates a player and links this Google account to it
--   google_link(id, secret)             -> links this Google account to a player who is already signed in
-- Setup (once): Supabase Dashboard -> Authentication -> Providers -> Google (client id + secret from Google Cloud),
-- and Authentication -> URL Configuration -> Redirect URLs: com.spaceship.game://oauth and the website / web game address.
alter table public.profiles add column if not exists google_id uuid unique;

create or replace function public.google_login() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_row public.profiles; v_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if uid is null then raise exception 'unauthorized'; end if;
  select * into v_row from public.profiles where google_id = uid;
  if v_row.id is not null then return public.ss_session_login(v_row) || jsonb_build_object('google', v_email); end if;
  return jsonb_build_object('new', true, 'email', v_email);
end $$;

create or replace function public.google_register(p_handle text, p_name text, p_avatar text default 'rocket') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r jsonb; v_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if exists (select 1 from public.profiles where google_id = uid) then raise exception 'google_used'; end if;
  r := public.register(p_handle, p_name, p_avatar);
  update public.profiles set google_id = uid where id = (r->>'id')::uuid;
  -- the Google address becomes the player's verified email too (when no other player has it)
  if v_email <> '' and not exists (select 1 from public.profiles where lower(email) = v_email) then
    update public.profiles set email = v_email where id = (r->>'id')::uuid;
    r := r || jsonb_build_object('email', v_email);
  end if;
  return r || jsonb_build_object('google', v_email);
end $$;

create or replace function public.google_link(p_id uuid, p_secret text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  perform public.ss_auth(p_id, p_secret);
  if uid is null then raise exception 'unauthorized'; end if;
  if exists (select 1 from public.profiles where google_id = uid and id <> p_id) then raise exception 'google_used'; end if;
  update public.profiles set google_id = uid where id = p_id;
  return jsonb_build_object('google', v_email);
end $$;

revoke all on function public.google_login(), public.google_register(text, text, text), public.google_link(uuid, text) from public, anon;
grant execute on function public.google_login(), public.google_register(text, text, text), public.google_link(uuid, text) to authenticated;
