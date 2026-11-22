-- 0000 · Row-level security for the three original tables: users, courses and session_events.
--
-- Its own change, applied to production on its own, before and apart from the learning loop.
--
-- What it fixes: row-level security was off on these tables while the API roles (anon and authenticated) held every
-- privilege on them, so the public key in the website was enough to read, change or delete any student's rows.
--
-- What it changes for the app: nothing. Every query the app makes on these tables runs as the signed-in student, on
-- that student's own rows: the browser with the student's session, the server with the student's token. Each
-- student keeps select, insert, update and delete on their own rows; visitors lose everything.
--
-- Safe to run twice. To undo it (only if something breaks): drop the three policies, disable row-level security on
-- the three tables and grant all on them to anon and authenticated again.

alter table public.users enable row level security;
alter table public.courses enable row level security;
alter table public.session_events enable row level security;

-- Visitors get nothing. Signed-in students keep the four operations the app uses; TRUNCATE (which ignores row-level
-- security), TRIGGER and REFERENCES go.
revoke all on public.users, public.courses, public.session_events from anon;
revoke truncate, trigger, references on public.users, public.courses, public.session_events from authenticated;
grant select, insert, update, delete on public.users, public.courses, public.session_events to authenticated;

drop policy if exists "users_own" on public.users;
create policy "users_own" on public.users for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "courses_own" on public.courses;
create policy "courses_own" on public.courses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A check-in can only point at the student's own lesson. Without this, another student could attach a row to your
-- lesson, and the foreign key would then stop you from deleting it.
drop policy if exists "session_events_own" on public.session_events;
create policy "session_events_own" on public.session_events for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (course_id is null or exists (
      select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid())))
  );
