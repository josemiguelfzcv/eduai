-- The three tables production had before Lyceo's own migrations (users, courses, session_events), exactly as the
-- read-only audit of production showed them on 2026-11-22 (supabase/checks/rls_audit.sql): same columns, identities,
-- defaults, foreign keys (to public.users, with no ON DELETE action), privileges and default privileges. Row-level
-- security is off, as it was there; migration 0000 turns it on. Staging starts from production's real state so that
-- every migration is tested on the path production will take.
--
-- STAGING AND LOCAL TESTS ONLY. Production already has these tables; never run this there.

create table if not exists public.users (
  id uuid primary key references auth.users (id),
  email text,
  name text,
  career text,
  created_at timestamptz default now(),
  learning_style text
);

-- One generated lesson. (The name predates My Academy, where "course" means a class the student takes.)
create table if not exists public.courses (
  id bigint generated always as identity primary key,
  user_id uuid references public.users (id),
  title text,
  description text,
  status text default 'processing',
  created_at timestamptz default now(),
  script jsonb
);

-- One answer to a lesson check-in.
create table if not exists public.session_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.users (id),
  course_id bigint references public.courses (id),
  segment_index integer,
  question text,
  answer text,
  correct boolean,
  time_to_answer_seconds integer,
  created_at timestamptz default now()
);

-- Production's privileges: every API role holds everything on these tables.
grant all on public.users, public.courses, public.session_events to anon, authenticated, service_role;

-- Production's default privileges in public (a project from before Supabase stopped exposing new tables): whatever
-- the migration role creates there is granted to the API roles, so migrations must revoke what they don't want.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
