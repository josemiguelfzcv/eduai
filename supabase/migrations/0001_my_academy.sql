-- My Academy: courses, deadlines, and lessons that belong to a course.
--
-- Additive only. The production app (which never reads these columns or tables)
-- keeps working before and after this runs, and running it twice is safe.
-- Run it in Supabase: SQL Editor -> New query -> paste -> Run. (On staging, scripts/db/migrate.mjs runs it.)

-- 1. Courses a student is taking. ("courses" already exists and stores generated lessons.)
create table if not exists public.academy_courses (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  code text check (code is null or char_length(code) <= 30),
  term text check (term is null or char_length(term) <= 40),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- 2. Exams, quizzes, assignments and other dated work for a course.
create table if not exists public.deadlines (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id bigint not null references public.academy_courses (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null default 'exam' check (kind in ('exam', 'quiz', 'assignment', 'project', 'other')),
  due_on date not null,
  topics text check (topics is null or char_length(topics) <= 500),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3. A lesson (row in "courses") can belong to one course. Deleting a course keeps its lessons.
alter table public.courses
  add column if not exists academy_course_id bigint references public.academy_courses (id) on delete set null;

create index if not exists academy_courses_user_idx on public.academy_courses (user_id);
create index if not exists deadlines_user_due_idx on public.deadlines (user_id, due_on);
create index if not exists deadlines_course_idx on public.deadlines (course_id);
create index if not exists courses_academy_course_idx on public.courses (academy_course_id);

-- 4. Each student only sees and changes their own courses and deadlines.
alter table public.academy_courses enable row level security;
alter table public.deadlines enable row level security;

drop policy if exists "academy_courses_owner" on public.academy_courses;
create policy "academy_courses_owner" on public.academy_courses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "deadlines_owner" on public.deadlines;
create policy "deadlines_owner" on public.deadlines
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.academy_courses c where c.id = course_id and c.user_id = (select auth.uid()))
  );

-- 5. Explicit privileges, whatever the project grants new tables by default. (Production still gives every new table in
--    public to the API roles; newer projects give them nothing.) Signed-in students reach these tables as
--    `authenticated`, with row-level security above; visitors get nothing; TRUNCATE, which ignores row-level security,
--    goes too.
revoke all on public.academy_courses, public.deadlines from anon, authenticated;
grant select, insert, update, delete on public.academy_courses, public.deadlines to authenticated;
