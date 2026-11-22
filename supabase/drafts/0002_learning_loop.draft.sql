-- DRAFT FOR REVIEW. DO NOT RUN.
-- Run it first on the staging project only, after supabase/checks/rls_audit.sql has been reviewed for production.
-- Everything here is additive: new tables, nullable or defaulted columns, and extra policies. The app on main keeps
-- working without reading any of it.

-- Course Memory -------------------------------------------------------------------------------------------------

-- One uploaded lecture, recording or document. The file lives in the private R2 bucket under materials/<user>/.
create table if not exists public.materials (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  academy_course_id bigint references public.academy_courses (id) on delete set null,
  kind text not null check (kind in ('pdf', 'audio', 'text')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  storage_key text check (storage_key is null or storage_key like 'materials/' || user_id::text || '/%'),
  byte_size integer check (byte_size is null or byte_size between 1 and 33554432),
  text text check (text is null or char_length(text) <= 400000),
  -- Where each page (or audio segment) starts in `text`: [{"n": 1, "start": 0}, ...]
  pages jsonb not null default '[]'::jsonb,
  status text not null default 'uploaded' check (status in ('uploaded', 'extracted', 'mapped', 'failed')),
  -- 'graded' marks material from a graded assignment: Lyceo practices the ideas but never writes its solutions.
  policy text not null default 'study' check (policy in ('study', 'graded')),
  created_at timestamptz not null default now()
);

-- One idea or ability per course, however many materials mention it. Progress hangs on the skill, not the source.
create table if not exists public.skills (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  academy_course_id bigint not null references public.academy_courses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  objective text check (objective is null or char_length(objective) <= 300),
  unit text check (unit is null or char_length(unit) <= 120),
  -- Which kinds of understanding the skill involves.
  facets text[] not null default '{}' check (facets <@ array['conceptual', 'procedural', 'application']::text[]),
  status text not null default 'active' check (status in ('active', 'hidden', 'merged')),
  merged_into bigint references public.skills (id) on delete set null,
  -- When the student accepted or edited it. Null means Lyceo proposed it and nobody has looked yet.
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists skills_unique_name
  on public.skills (user_id, academy_course_id, lower(btrim(name))) where status = 'active';

-- Where a skill appears: a page of a material, or a part of an older lesson.
create table if not exists public.skill_sources (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  skill_id bigint not null references public.skills (id) on delete cascade,
  material_id bigint references public.materials (id) on delete cascade,
  lesson_id bigint references public.courses (id) on delete cascade,
  -- {"pages": [4, 6]} for a material, {"part": 2} for a lesson, {"seconds": [120, 300]} for audio.
  locator jsonb not null default '{}'::jsonb,
  quote text check (quote is null or char_length(quote) <= 300),
  -- 'extracted' needs a quote found on the cited page; otherwise the source is 'inferred'.
  origin text not null check (origin in ('extracted', 'inferred', 'student')),
  created_at timestamptz not null default now(),
  check (material_id is not null or lesson_id is not null)
);

-- Student Memory ------------------------------------------------------------------------------------------------

-- A study session that survives closing the browser.
create table if not exists public.study_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  academy_course_id bigint references public.academy_courses (id) on delete cascade,
  mode text not null check (mode in ('quick_check', 'guided_review', 'learn_from_scratch')),
  skill_ids bigint[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'stopped')),
  -- Generated questions. Answer keys are sealed with a server key, so they can't be read from the browser.
  items jsonb not null default '[]'::jsonb,
  active_seconds integer not null default 0 check (active_seconds between 0 and 86400),
  -- What the student saw at the end. Decisions never read it; they re-read the evidence.
  summary jsonb,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz
);

-- The evidence log stays session_events: one row per answer. These are raw facts; whether an answer counts as
-- independent, and what it says about mastery, is decided by a versioned policy in code.
alter table public.session_events
  add column if not exists skill_id bigint references public.skills (id) on delete cascade,
  add column if not exists study_session_id bigint references public.study_sessions (id) on delete set null,
  add column if not exists source text
    check (source is null or source in ('lesson_checkin', 'quick_check', 'practice', 'reassessment')),
  -- Snapshot of the question: prompt, answer format, item hash and every skill it touches.
  add column if not exists item jsonb,
  add column if not exists difficulty smallint check (difficulty is null or difficulty between 1 and 3),
  add column if not exists facet text check (facet is null or facet in ('conceptual', 'procedural', 'application')),
  add column if not exists hints_used smallint not null default 0 check (hints_used between 0 and 10),
  -- True when this skill was explained earlier in the same session.
  add column if not exists explained_before boolean,
  -- True when the student had never seen this exact question.
  add column if not exists novel boolean,
  add column if not exists grader text check (grader is null or grader in ('rule', 'model', 'self')),
  add column if not exists grade_confidence real check (grade_confidence is null or grade_confidence between 0 and 1),
  add column if not exists error_tag text check (error_tag is null or char_length(error_tag) <= 80);
-- Answers in a Quick Check don't belong to a lesson. No-ops if these columns are already nullable.
alter table public.session_events alter column course_id drop not null;
alter table public.session_events alter column segment_index drop not null;

-- Which material each lesson was written from.
alter table public.courses
  add column if not exists material_id bigint references public.materials (id) on delete set null;

-- Cost of every paid AI call. Students can read their own rows; nobody can change or delete them.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  study_session_id bigint references public.study_sessions (id) on delete set null,
  task text not null,
  provider text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  characters integer,
  seconds real,
  cost_usd numeric(10, 6),
  latency_ms integer,
  ok boolean not null,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes -------------------------------------------------------------------------------------------------------

create index if not exists materials_user_course_idx on public.materials (user_id, academy_course_id);
create index if not exists skills_user_course_idx on public.skills (user_id, academy_course_id);
create index if not exists skill_sources_skill_idx on public.skill_sources (skill_id);
create index if not exists skill_sources_material_idx on public.skill_sources (material_id);
create index if not exists study_sessions_user_idx on public.study_sessions (user_id, last_active_at desc);
create index if not exists session_events_skill_idx on public.session_events (user_id, skill_id, created_at);
create index if not exists ai_usage_user_day_idx on public.ai_usage (user_id, created_at);

-- Row-level security --------------------------------------------------------------------------------------------

alter table public.materials enable row level security;
alter table public.skills enable row level security;
alter table public.skill_sources enable row level security;
alter table public.study_sessions enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "materials_owner" on public.materials;
create policy "materials_owner" on public.materials for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (academy_course_id is null
      or exists (select 1 from public.academy_courses c where c.id = academy_course_id and c.user_id = auth.uid()))
  );

drop policy if exists "skills_owner" on public.skills;
create policy "skills_owner" on public.skills for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.academy_courses c where c.id = academy_course_id and c.user_id = auth.uid())
    and (merged_into is null or exists (select 1 from public.skills s where s.id = merged_into and s.user_id = auth.uid()))
  );

drop policy if exists "skill_sources_owner" on public.skill_sources;
create policy "skill_sources_owner" on public.skill_sources for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.skills s where s.id = skill_id and s.user_id = auth.uid())
    and (material_id is null or exists (select 1 from public.materials m where m.id = material_id and m.user_id = auth.uid()))
    and (lesson_id is null or exists (select 1 from public.courses l where l.id = lesson_id and l.user_id = auth.uid()))
  );

drop policy if exists "study_sessions_owner" on public.study_sessions;
create policy "study_sessions_owner" on public.study_sessions for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (academy_course_id is null
      or exists (select 1 from public.academy_courses c where c.id = academy_course_id and c.user_id = auth.uid()))
  );

-- session_events already has policies (see rls_audit.sql). These restrictive ones are added on top of them, so a
-- row can only point at the student's own skill and session, whatever the existing policies allow.
drop policy if exists "session_events_own_refs_insert" on public.session_events;
create policy "session_events_own_refs_insert" on public.session_events as restrictive for insert to authenticated
  with check (
    (skill_id is null or exists (select 1 from public.skills s where s.id = skill_id and s.user_id = auth.uid()))
    and (study_session_id is null
      or exists (select 1 from public.study_sessions ss where ss.id = study_session_id and ss.user_id = auth.uid()))
  );
drop policy if exists "session_events_own_refs_update" on public.session_events;
create policy "session_events_own_refs_update" on public.session_events as restrictive for update to authenticated
  using (user_id = auth.uid())
  with check (
    (skill_id is null or exists (select 1 from public.skills s where s.id = skill_id and s.user_id = auth.uid()))
    and (study_session_id is null
      or exists (select 1 from public.study_sessions ss where ss.id = study_session_id and ss.user_id = auth.uid()))
  );

drop policy if exists "ai_usage_insert_own" on public.ai_usage;
create policy "ai_usage_insert_own" on public.ai_usage for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "ai_usage_read_own" on public.ai_usage;
create policy "ai_usage_read_own" on public.ai_usage for select to authenticated using (user_id = auth.uid());
-- No update or delete policy: usage rows can't be changed through the API.
