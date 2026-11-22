-- 0004 · A student deletes their own account.
--
-- STAGING ONLY until the schema review is approved. Run after 0002 and 0003.
--
-- Permissions, in one place:
--   * Who can delete an account: only its owner, signed in within the last 15 minutes (the JWT's amr timestamp), so a
--     stolen or forgotten session can't do it. Nobody else, Lyceo's server included, can delete a student's account
--     through this function: it only ever deletes auth.uid().
--   * What runs with elevated rights: this function, as its owner (postgres on Supabase), because deleting from
--     auth.users needs it. It's executable by authenticated only, never by anon.
--   * What it can't do: delete the student's files. Those are in R2, which Postgres can't reach. It leaves a row in
--     private.account_deletions, and the server deletes everything under materials/<user>/ and incoming/<user>/,
--     retrying until it succeeds.
--   * What's kept: cost records, with the student removed (user_id set to null). Nothing else.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_signed_in_at bigint;
begin
  if v_user is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;
  select max((m.value ->> 'timestamp')::bigint) into v_signed_in_at
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m;
  if v_signed_in_at is null or v_signed_in_at < extract(epoch from now()) - 900 then
    raise exception 'Sign in again to delete your account.' using errcode = 'LY010';
  end if;

  insert into private.account_deletions (user_id) values (v_user)
  on conflict (user_id) do update set requested_at = now(), files_deleted_at = null;

  -- Explicit deletes, children first, so nothing depends on how older tables declared their foreign keys.
  delete from public.session_events where user_id = v_user;
  delete from public.study_sessions where user_id = v_user;
  delete from public.skill_sources where user_id = v_user;
  delete from public.skills where user_id = v_user;
  delete from public.materials where user_id = v_user;
  delete from public.deadlines where user_id = v_user;
  delete from public.courses where user_id = v_user;
  delete from public.academy_courses where user_id = v_user;
  delete from public.users where id = v_user;
  delete from private.item_keys where user_id = v_user;
  delete from private.usage_days where bucket = v_user::text;
  update private.ai_usage set user_id = null where user_id = v_user;

  delete from auth.users where id = v_user;
end
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
