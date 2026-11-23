-- 0007 · The learning environment: lectures in order, written lessons with reading progress, and Ask Lyceo.
--
-- STAGING ONLY until the schema review is approved. scripts/db/migrate.mjs refuses to run it against production.
--
--   materials.role, sequence, lecture_date   what each material is in its course (a lecture, an assignment, a
--                                            reading) and its place in time, so lectures read in order
--   material_lessons                         the written lesson of one material: its outline, and where the student
--                                            is in it (current section, finished sections, reading position)
--   lesson_sections                          each section's text, written once by the model and kept
--   lesson_messages                          the Ask Lyceo conversation beside a lesson, with the passage asked about
--
-- All of it is the student's own: row-level security limits every row to its owner, and the rows go with the
-- account (on delete cascade). None of it is evidence of learning; answers still live in session_events.

alter table public.materials
  add column if not exists role text not null default 'lecture'
    check (role in ('lecture', 'assignment', 'reading', 'other')),
  add column if not exists sequence integer check (sequence between 1 and 10000),
  add column if not exists lecture_date date;

-- Materials already uploaded become lectures in the order they were added, course by course.
update public.materials m
   set sequence = o.n
  from (select id, row_number() over (partition by user_id, academy_course_id order by created_at, id) as n
          from public.materials) o
 where o.id = m.id and m.sequence is null;

grant insert (role, sequence, lecture_date) on public.materials to authenticated;
grant update (role, sequence, lecture_date) on public.materials to authenticated;

create table if not exists public.material_lessons (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id bigint not null unique references public.materials (id) on delete cascade,
  -- [{id, title, goal, kind, skillIds, pages, minutes}], in teaching order.
  outline jsonb not null check (jsonb_typeof(outline) = 'array' and jsonb_array_length(outline) between 1 and 20),
  model text check (char_length(model) <= 80),
  prompt_version text check (char_length(prompt_version) <= 40),
  current_section text check (char_length(current_section) <= 40),
  completed_sections text[] not null default '{}' check (cardinality(completed_sections) <= 20),
  -- Where the student was reading: {section, block, offset}. Kept small.
  position jsonb check (position is null or (jsonb_typeof(position) = 'object' and pg_column_size(position) < 1000)),
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists material_lessons_user on public.material_lessons (user_id);

create table if not exists public.lesson_sections (
  lesson_id bigint not null references public.material_lessons (id) on delete cascade,
  section_id text not null check (section_id ~ '^[a-z0-9-]{1,40}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 60000),
  model text check (char_length(model) <= 80),
  created_at timestamptz not null default now(),
  primary key (lesson_id, section_id)
);
create index if not exists lesson_sections_user on public.lesson_sections (user_id);

create table if not exists public.lesson_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id bigint not null references public.materials (id) on delete cascade,
  role text not null check (role in ('student', 'lyceo')),
  content text not null check (char_length(content) between 1 and 20000),
  -- The passage the student asked about: {sectionId, quote}.
  context jsonb check (context is null or (jsonb_typeof(context) = 'object' and pg_column_size(context) < 4000)),
  created_at timestamptz not null default now()
);
create index if not exists lesson_messages_thread on public.lesson_messages (material_id, created_at);
create index if not exists lesson_messages_user on public.lesson_messages (user_id);

-- Supabase grants everything on new tables to anon and authenticated by default; take it back, then grant what the
-- app uses. anon gets nothing.
revoke all on public.material_lessons, public.lesson_sections, public.lesson_messages from anon, authenticated;
grant select, insert, update, delete on public.material_lessons, public.lesson_sections, public.lesson_messages
  to authenticated;

alter table public.material_lessons enable row level security;
alter table public.lesson_sections enable row level security;
alter table public.lesson_messages enable row level security;

drop policy if exists "material_lessons_owner" on public.material_lessons;
create policy "material_lessons_owner" on public.material_lessons for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.materials m where m.id = material_id and m.user_id = (select auth.uid()))
  );

drop policy if exists "lesson_sections_owner" on public.lesson_sections;
create policy "lesson_sections_owner" on public.lesson_sections for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.material_lessons l where l.id = lesson_id and l.user_id = (select auth.uid()))
  );

drop policy if exists "lesson_messages_owner" on public.lesson_messages;
create policy "lesson_messages_owner" on public.lesson_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.materials m where m.id = material_id and m.user_id = (select auth.uid()))
  );
