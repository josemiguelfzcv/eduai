-- 0002 · The learning loop: course memory, student memory and the evidence they produce.
--
-- STAGING ONLY until the schema review is approved. scripts/db/migrate.mjs refuses to run it against production.
-- Additive: new tables, new nullable or defaulted columns, new policies. The app on main never reads any of it.
--
-- Who writes what
--   The student, through the Data API (role authenticated, row-level security):
--     materials (title, course, policy), skills, skill_sources      things the student organizes and corrects
--   Only Lyceo's server, through the functions in 0003 (role lyceo_server):
--     study_sessions, evidence from study sessions, answer keys,     things the system observed
--     usage records, a material's file and extracted text
--   Students can read everything that's theirs except answer keys and usage records, which live in schema private.

-- Course Memory -------------------------------------------------------------------------------------------------

-- One uploaded lecture, recording or document. The file lives in the private R2 bucket at materials/<user>/<id>.
create table if not exists public.materials (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  academy_course_id bigint references public.academy_courses (id) on delete set null,
  kind text not null check (kind in ('pdf', 'audio', 'text')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- What the browser said it would upload. The server compares the stored object with it before accepting the file.
  declared_bytes integer check (declared_bytes is null or declared_bytes between 1 and 33554432),
  -- Set by the server once the file passed validation.
  storage_key text,
  byte_size integer check (byte_size is null or byte_size between 1 and 33554432),
  text text check (text is null or char_length(text) <= 400000),
  -- Where each page (or stretch of audio) starts in `text`: [{"n": 1, "start": 0}, ...]
  pages jsonb not null default '[]'::jsonb check (jsonb_typeof(pages) = 'array'),
  status text not null default 'pending'
    check (status in ('pending', 'uploaded', 'extracted', 'mapped', 'failed')),
  failure text check (failure is null or char_length(failure) <= 200),
  -- 'graded' marks material from a graded assignment: Lyceo practices the ideas but never writes its solutions.
  policy text not null default 'study' check (policy in ('study', 'graded')),
  created_at timestamptz not null default now(),
  check (storage_key is null or storage_key = 'materials/' || user_id::text || '/' || id::text)
);

-- One idea or ability per course, however many materials mention it. Progress hangs on the skill, never on a source,
-- so a skill that appears in three lectures still has one record of what the student has shown.
create table if not exists public.skills (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  academy_course_id bigint not null references public.academy_courses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  objective text check (objective is null or char_length(objective) <= 300),
  unit text check (unit is null or char_length(unit) <= 120),
  -- Which kinds of understanding the skill involves.
  facets text[] not null default '{}' check (facets <@ array['conceptual', 'procedural', 'application']::text[]),
  -- Proposed skills are active right away; the student only acts to hide, rename or merge one.
  status text not null default 'active' check (status in ('active', 'hidden', 'merged')),
  -- A merged skill's evidence counts for the skill it was merged into, which must belong to the same student and
  -- course (the composite foreign key below enforces it for every writer). If that skill is deleted, merged_into
  -- becomes null and the policy treats the merged skill as hidden.
  merged_into bigint,
  check (merged_into is null or merged_into <> id),
  unique (id, user_id, academy_course_id),
  foreign key (merged_into, user_id, academy_course_id)
    references public.skills (id, user_id, academy_course_id) on delete set null (merged_into),
  -- When the student last looked at it and kept or edited it. Null: Lyceo proposed it and nobody has checked yet.
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists skills_unique_name
  on public.skills (user_id, academy_course_id, lower(btrim(name))) where status = 'active';

-- Where a skill appears: pages of a material, or a part of an older lesson. Many per skill.
create table if not exists public.skill_sources (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  skill_id bigint not null references public.skills (id) on delete cascade,
  material_id bigint references public.materials (id) on delete cascade,
  lesson_id bigint references public.courses (id) on delete cascade,
  -- {"pages": [4, 6]} for a material, {"part": 2} for a lesson, {"seconds": [120, 300]} for audio.
  locator jsonb not null default '{}'::jsonb check (jsonb_typeof(locator) = 'object'),
  quote text check (quote is null or char_length(quote) <= 300),
  -- 'extracted' needs a quote found on the cited page; otherwise the source is 'inferred'.
  origin text not null check (origin in ('extracted', 'inferred', 'student')),
  created_at timestamptz not null default now(),
  check (material_id is not null or lesson_id is not null)
);

-- Student Memory ------------------------------------------------------------------------------------------------

-- A study session that survives closing the browser. Written only by the server.
create table if not exists public.study_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  academy_course_id bigint references public.academy_courses (id) on delete cascade,
  mode text not null check (mode in ('quick_check', 'guided_review', 'learn_from_scratch')),
  skill_ids bigint[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'completed', 'stopped')),
  -- What the student sees: questions, choices, explanations. Never answer keys: those are in private.item_keys, and
  -- the function that adds items refuses any item that carries one.
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  active_seconds integer not null default 0 check (active_seconds between 0 and 86400),
  -- What the student saw at the end. Decisions never read it; they re-read the evidence.
  summary jsonb,
  -- Mastery policy that chose this session's questions, e.g. 'v1'.
  policy_version text check (policy_version is null or char_length(policy_version) <= 20),
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz
);

-- The evidence log stays session_events: one row per answer, with raw facts only. Whether an answer is independent is
-- derived from those facts when the row is written; what it says about mastery is decided later by a versioned policy
-- in code, so the policy can change without rewriting history.
alter table public.session_events
  add column if not exists skill_id bigint references public.skills (id) on delete cascade,
  add column if not exists study_session_id bigint references public.study_sessions (id) on delete cascade,
  add column if not exists item_id text check (item_id is null or char_length(item_id) <= 40),
  add column if not exists source text
    check (source is null or source in ('lesson_checkin', 'quick_check', 'practice', 'reassessment')),
  -- Snapshot of the question as asked and, once answered, its solution.
  add column if not exists item jsonb,
  add column if not exists difficulty smallint check (difficulty is null or difficulty between 1 and 3),
  add column if not exists facet text check (facet is null or facet in ('conceptual', 'procedural', 'application')),
  add column if not exists hints_used smallint not null default 0 check (hints_used between 0 and 10),
  -- True when this skill was explained earlier in the same session.
  add column if not exists explained_before boolean,
  -- True when the student had never seen this question before.
  add column if not exists novel boolean,
  -- independent: no hint, nothing explained earlier in the session, a question never seen. Anything else is assisted.
  add column if not exists attempt_mode text check (attempt_mode is null or attempt_mode in ('independent', 'assisted')),
  -- 0 for the first try at a skill in a session; 1 and 2 for the practice questions after the first and second
  -- explanation.
  add column if not exists teaching_round smallint check (teaching_round is null or teaching_round between 0 and 2),
  -- The wrong or partial answer whose explanation this practice attempt follows.
  add column if not exists follows_event_id bigint references public.session_events (id) on delete set null,
  add column if not exists verdict text
    check (verdict is null or verdict in ('correct', 'partial', 'incorrect', 'unclear')),
  -- Rubric points the answer met, e.g. 2 of 3. Facts about one answer, not a mastery percentage.
  add column if not exists rubric_met smallint check (rubric_met is null or rubric_met between 0 and 10),
  add column if not exists rubric_total smallint check (rubric_total is null or rubric_total between 1 and 10),
  add column if not exists grader text check (grader is null or grader in ('rule', 'model', 'self')),
  -- Model id and prompt version, so answers graded by an older grader can be found and re-checked.
  add column if not exists grader_version text check (grader_version is null or char_length(grader_version) <= 80),
  -- Two independent model gradings agreed. Required before a model-graded answer can count toward confirming a skill.
  add column if not exists double_graded boolean,
  add column if not exists needs_review boolean not null default false,
  -- The model's own estimate of its certainty. Kept to measure calibration; no decision reads it.
  add column if not exists grade_confidence real check (grade_confidence is null or grade_confidence between 0 and 1),
  add column if not exists error_tag text check (error_tag is null or char_length(error_tag) <= 80);

-- Answers in a study session don't belong to a lesson. No-ops where the columns are already nullable.
alter table public.session_events alter column course_id drop not null;
alter table public.session_events alter column segment_index drop not null;

-- Which material each lesson was written from.
alter table public.courses
  add column if not exists material_id bigint references public.materials (id) on delete set null;

-- Indexes -------------------------------------------------------------------------------------------------------

create index if not exists materials_user_course_idx on public.materials (user_id, academy_course_id);
create index if not exists skills_user_course_idx on public.skills (user_id, academy_course_id);
create index if not exists skill_sources_skill_idx on public.skill_sources (skill_id);
create index if not exists skill_sources_material_idx on public.skill_sources (material_id);
create index if not exists skill_sources_lesson_idx on public.skill_sources (lesson_id);
create index if not exists study_sessions_user_idx on public.study_sessions (user_id, last_active_at desc);
create index if not exists session_events_skill_idx on public.session_events (user_id, skill_id, created_at);
create index if not exists session_events_session_idx on public.session_events (study_session_id, item_id);
create index if not exists courses_material_idx on public.courses (material_id);

-- Privileges ----------------------------------------------------------------------------------------------------
-- Explicit, because new tables are no longer exposed automatically. Visitors (anon) get nothing.

revoke all on public.materials, public.skills, public.skill_sources, public.study_sessions from anon, authenticated;

-- Materials: the student names and files them; the server alone sets the file, its size, its text and its status.
-- No delete: removing a material also removes its file, so it goes through the server.
grant select on public.materials to authenticated;
grant insert (academy_course_id, kind, title, declared_bytes, policy) on public.materials to authenticated;
grant update (academy_course_id, title, policy) on public.materials to authenticated;

-- The skill map is the student's to accept, rename, merge, hide or extend.
grant select, insert, update, delete on public.skills to authenticated;
grant select, insert, update, delete on public.skill_sources to authenticated;

-- Study sessions are read-only for students.
grant select on public.study_sessions to authenticated;

-- Row-level security --------------------------------------------------------------------------------------------

alter table public.materials enable row level security;
alter table public.skills enable row level security;
alter table public.skill_sources enable row level security;
alter table public.study_sessions enable row level security;

drop policy if exists "materials_select" on public.materials;
create policy "materials_select" on public.materials for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "materials_insert" on public.materials;
create policy "materials_insert" on public.materials for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (academy_course_id is null or exists (
      select 1 from public.academy_courses c where c.id = academy_course_id and c.user_id = (select auth.uid())))
  );
drop policy if exists "materials_update" on public.materials;
create policy "materials_update" on public.materials for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (academy_course_id is null or exists (
      select 1 from public.academy_courses c where c.id = academy_course_id and c.user_id = (select auth.uid())))
  );

-- (Where a skill may be merged is enforced by the foreign key on skills: a policy can't query its own table.)
drop policy if exists "skills_owner" on public.skills;
create policy "skills_owner" on public.skills for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.academy_courses c where c.id = academy_course_id and c.user_id = (select auth.uid()))
  );

-- A skill with recorded answers can't be deleted by the student, only hidden, so tidying the map never erases learning
-- evidence. (Deleting the whole course, or the account, still removes everything: those cascade.)
drop policy if exists "skills_keep_evidence" on public.skills;
create policy "skills_keep_evidence" on public.skills as restrictive for delete to authenticated
  using (not exists (select 1 from public.session_events e where e.skill_id = skills.id));

drop policy if exists "skill_sources_owner" on public.skill_sources;
create policy "skill_sources_owner" on public.skill_sources for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.skills s where s.id = skill_id and s.user_id = (select auth.uid()))
    and (material_id is null or exists (
      select 1 from public.materials m where m.id = material_id and m.user_id = (select auth.uid())))
    and (lesson_id is null or exists (
      select 1 from public.courses l where l.id = lesson_id and l.user_id = (select auth.uid())))
  );

drop policy if exists "study_sessions_select" on public.study_sessions;
create policy "study_sessions_select" on public.study_sessions for select to authenticated
  using (user_id = (select auth.uid()));

-- session_events keeps its existing policies (see rls_audit.sql), so lesson check-ins keep working on main. These
-- restrictive policies are added on top: whatever the existing ones allow, a student can only write plain lesson
-- check-ins, and can't change or delete evidence that came from a study session.
drop policy if exists "session_events_students_write_checkins_only" on public.session_events;
create policy "session_events_students_write_checkins_only" on public.session_events
  as restrictive for insert to authenticated
  with check (
    study_session_id is null and skill_id is null and item_id is null
    and coalesce(source, 'lesson_checkin') = 'lesson_checkin'
    and attempt_mode is null and verdict is null and grader is null and double_graded is null
    and rubric_met is null and teaching_round is null and follows_event_id is null
  );
drop policy if exists "session_events_students_keep_session_evidence" on public.session_events;
create policy "session_events_students_keep_session_evidence" on public.session_events
  as restrictive for update to authenticated
  using (study_session_id is null)
  with check (
    study_session_id is null and skill_id is null and item_id is null
    and coalesce(source, 'lesson_checkin') = 'lesson_checkin'
    and attempt_mode is null and verdict is null and grader is null and double_graded is null
    and rubric_met is null and teaching_round is null and follows_event_id is null
  );
drop policy if exists "session_events_students_delete_checkins_only" on public.session_events;
create policy "session_events_students_delete_checkins_only" on public.session_events
  as restrictive for delete to authenticated
  using (study_session_id is null);
