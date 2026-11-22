-- 0003 · The trusted server path: usage and cost records, daily limits, answer keys and study-session evidence.
--
-- STAGING ONLY until the schema review is approved. scripts/db/migrate.mjs refuses to run it against production.
--
-- Schema private isn't exposed through the Data API, and anon and authenticated have no privileges on it, so nothing
-- here can be read or written from a browser, whatever request is sent to Supabase. Lyceo's server reaches it as the
-- lyceo_server role over a pooled Postgres connection, and lyceo_server can do exactly one thing: call the functions
-- below. Each one takes the student id the server verified with Supabase Auth and checks that everything it touches
-- belongs to that student. Every function runs with `search_path = ''` and names every object it uses.

create schema if not exists private;
revoke all on schema private from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lyceo_server') then
    -- No login and no password yet: scripts/db/server-role.mjs prints the statement that enables it, so the password
    -- never sits in this repository. Not a superuser, can't bypass row-level security, can't create anything.
    create role lyceo_server nologin noinherit connection limit 40;
  end if;
end
$$;
alter role lyceo_server set statement_timeout = '5s';
grant usage on schema private to lyceo_server;
-- Postgres lets everyone execute a new function, and a per-schema default can't take that away (it only adds to the
-- global defaults). So every migration that adds a function here must revoke it from public, as the end of this file
-- does; tests/db fails if any function in private is executable by anyone but lyceo_server.

-- Usage and limits -----------------------------------------------------------------------------------------------

-- Daily limits in USD. 'student' applies to each signed-in student, 'visitor' to the public demo as a whole and
-- 'everyone' to the whole app. max_in_flight caps calls running at the same time.
create table if not exists private.usage_limits (
  scope text primary key check (scope in ('student', 'visitor', 'everyone')),
  daily_usd numeric(10, 4) not null check (daily_usd >= 0),
  max_in_flight integer not null check (max_in_flight between 1 and 1000),
  updated_at timestamptz not null default now()
);
insert into private.usage_limits (scope, daily_usd, max_in_flight)
values ('student', 1.50, 4), ('visitor', 2.00, 6), ('everyone', 25.00, 60)
on conflict (scope) do nothing;

-- Running totals per UTC day: one row for each student who used Lyceo that day, one for the demo, one for everyone.
create table if not exists private.usage_days (
  bucket text not null,
  day date not null,
  reserved_usd numeric(12, 6) not null default 0 check (reserved_usd >= 0),
  spent_usd numeric(12, 6) not null default 0 check (spent_usd >= 0),
  calls integer not null default 0,
  primary key (bucket, day)
);

-- One row per paid call. A row is written before the call (a reservation, at a deliberately high estimate) and settled
-- with the real cost afterwards. A call that never settles keeps counting at its estimate.
create table if not exists private.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  scope text not null check (scope in ('student', 'visitor')),
  study_session_id bigint references public.study_sessions (id) on delete set null,
  task text not null check (char_length(task) between 1 and 40),
  provider text not null check (provider in ('anthropic', 'elevenlabs', 'openai')),
  model text not null check (char_length(model) between 1 and 80),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'failed')),
  estimate_usd numeric(10, 6) not null check (estimate_usd >= 0),
  cost_usd numeric(10, 6) check (cost_usd is null or cost_usd >= 0),
  -- Which price table priced it (app/lib/server/usage.ts).
  price_version text not null check (char_length(price_version) between 1 and 20),
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  characters integer,
  seconds numeric(10, 2),
  latency_ms integer,
  cached boolean not null default false,
  day date not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists ai_usage_in_flight_idx on private.ai_usage (created_at) where status = 'reserved';
create index if not exists ai_usage_user_idx on private.ai_usage (user_id, created_at);
create index if not exists ai_usage_day_idx on private.ai_usage (day);

-- Answer keys ----------------------------------------------------------------------------------------------------

-- Accepted answers, tolerance, rubric points and worked solution for each question in a study session. The question
-- itself, without any of this, is in public.study_sessions.items.
create table if not exists private.item_keys (
  study_session_id bigint not null references public.study_sessions (id) on delete cascade,
  item_id text not null check (char_length(item_id) between 1 and 40),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id bigint not null references public.skills (id) on delete cascade,
  difficulty smallint not null check (difficulty between 1 and 3),
  facet text not null check (facet in ('conceptual', 'procedural', 'application')),
  key jsonb not null check (jsonb_typeof(key) = 'object'),
  -- When the solution was first shown, which only happens after the student answered.
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (study_session_id, item_id)
);
create index if not exists item_keys_user_idx on private.item_keys (user_id);
create index if not exists item_keys_skill_idx on private.item_keys (skill_id);

-- Account deletion -----------------------------------------------------------------------------------------------

-- Accounts deleted whose files still have to be removed from storage. No foreign key: the user is gone. Rows are
-- purged 30 days after the files are gone.
create table if not exists private.account_deletions (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  files_deleted_at timestamptz,
  attempts integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 300)
);

alter table private.usage_limits enable row level security;
alter table private.usage_days enable row level security;
alter table private.ai_usage enable row level security;
alter table private.item_keys enable row level security;
alter table private.account_deletions enable row level security;
-- No policies and no grants: only the functions below (running as the schema owner) touch these tables.

-- Usage functions ------------------------------------------------------------------------------------------------

-- Reserves room for one paid call before it's made. Raises LY001 when the student's daily limit would be passed,
-- LY002 when the app's would, LY003 when too many calls are already running. Returns the reservation id.
create or replace function private.usage_reserve(
  p_user uuid,
  p_task text,
  p_provider text,
  p_model text,
  p_estimate_usd numeric,
  p_price_version text,
  p_study_session bigint default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_scope text := case when p_user is null then 'visitor' else 'student' end;
  v_bucket text := coalesce(p_user::text, 'visitor');
  v_everyone private.usage_limits;
  v_mine private.usage_limits;
  v_running integer;
  v_id bigint;
begin
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > 5 then
    raise exception 'usage estimate out of range: %', p_estimate_usd using errcode = '22023';
  end if;
  if p_study_session is not null and not exists (
    select 1 from public.study_sessions s where s.id = p_study_session and s.user_id = p_user
  ) then
    raise exception 'study session % is not this student''s', p_study_session using errcode = '42501';
  end if;
  select * into strict v_everyone from private.usage_limits where scope = 'everyone';
  select * into strict v_mine from private.usage_limits where scope = v_scope;

  insert into private.usage_days (bucket, day) values ('everyone', v_day), (v_bucket, v_day)
  on conflict (bucket, day) do nothing;

  -- The shared row is always locked before the student's, so concurrent calls can't deadlock. Each update checks the
  -- limit and adds the reservation in one statement: a concurrent call waits for the row, then re-checks the limit
  -- against what this one added.
  update private.usage_days
     set reserved_usd = reserved_usd + p_estimate_usd, calls = calls + 1
   where bucket = 'everyone' and day = v_day
     and spent_usd + reserved_usd + p_estimate_usd <= v_everyone.daily_usd;
  if not found then
    raise exception 'Lyceo reached its usage limit for today' using errcode = 'LY002';
  end if;
  -- Counted while holding the shared row, so it includes every reservation committed before this one.
  select count(*) into v_running from private.ai_usage
   where status = 'reserved' and created_at > now() - interval '15 minutes';
  if v_running >= v_everyone.max_in_flight then
    raise exception 'too many calls running' using errcode = 'LY003';
  end if;

  update private.usage_days
     set reserved_usd = reserved_usd + p_estimate_usd, calls = calls + 1
   where bucket = v_bucket and day = v_day
     and spent_usd + reserved_usd + p_estimate_usd <= v_mine.daily_usd;
  if not found then
    raise exception 'daily limit reached' using errcode = 'LY001';
  end if;
  select count(*) into v_running from private.ai_usage
   where status = 'reserved' and created_at > now() - interval '15 minutes'
     and scope = v_scope and user_id is not distinct from p_user;
  if v_running >= v_mine.max_in_flight then
    raise exception 'too many calls running' using errcode = 'LY003';
  end if;

  insert into private.ai_usage (user_id, scope, study_session_id, task, provider, model, estimate_usd, price_version, day)
  values (p_user, v_scope, p_study_session, p_task, p_provider, p_model, p_estimate_usd, p_price_version, v_day)
  returning id into v_id;
  return v_id;
end
$$;

-- Records what a reserved call really cost and releases the reservation. Settling twice changes nothing and returns
-- false. A successful call whose price is unknown is charged its estimate; a failed one with no known cost, nothing.
create or replace function private.usage_settle(
  p_id bigint,
  p_ok boolean,
  p_cost_usd numeric default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_cache_read_tokens integer default null,
  p_cache_write_tokens integer default null,
  p_characters integer default null,
  p_seconds numeric default null,
  p_latency_ms integer default null,
  p_cached boolean default false
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.ai_usage;
  v_charge numeric;
begin
  if p_cost_usd is not null and (p_cost_usd < 0 or p_cost_usd > 50) then
    raise exception 'cost out of range: %', p_cost_usd using errcode = '22023';
  end if;
  update private.ai_usage
     set status = case when p_ok then 'settled' else 'failed' end,
         cost_usd = p_cost_usd,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         cache_read_tokens = p_cache_read_tokens,
         cache_write_tokens = p_cache_write_tokens,
         characters = p_characters,
         seconds = p_seconds,
         latency_ms = p_latency_ms,
         cached = coalesce(p_cached, false),
         settled_at = now()
   where id = p_id and status = 'reserved'
  returning * into v_row;
  if not found then
    return false;
  end if;

  v_charge := case when p_cost_usd is not null then p_cost_usd when p_ok then v_row.estimate_usd else 0 end;
  update private.usage_days
     set reserved_usd = greatest(reserved_usd - v_row.estimate_usd, 0), spent_usd = spent_usd + v_charge
   where bucket = 'everyone' and day = v_row.day;
  if v_row.scope = 'visitor' or v_row.user_id is not null then
    update private.usage_days
       set reserved_usd = greatest(reserved_usd - v_row.estimate_usd, 0), spent_usd = spent_usd + v_charge
     where bucket = coalesce(v_row.user_id::text, 'visitor') and day = v_row.day;
  end if;
  return true;
end
$$;

-- Study sessions -------------------------------------------------------------------------------------------------

create or replace function private.session_start(
  p_user uuid,
  p_course bigint,
  p_mode text,
  p_skill_ids bigint[],
  p_policy_version text
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_user is null then
    raise exception 'missing student' using errcode = '22023';
  end if;
  if p_course is not null and not exists (
    select 1 from public.academy_courses c where c.id = p_course and c.user_id = p_user
  ) then
    raise exception 'course % is not this student''s', p_course using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_skill_ids, '{}'::bigint[])) as wanted(id)
    where not exists (
      select 1 from public.skills s
      where s.id = wanted.id and s.user_id = p_user and s.status = 'active'
        and (p_course is null or s.academy_course_id = p_course)
    )
  ) then
    raise exception 'a skill in this session is not this student''s' using errcode = '42501';
  end if;
  insert into public.study_sessions (user_id, academy_course_id, mode, skill_ids, policy_version)
  values (p_user, p_course, p_mode, coalesce(p_skill_ids, '{}'::bigint[]), p_policy_version)
  returning id into v_id;
  return v_id;
end
$$;

-- Adds questions (each with its key) and explanations (no key) to an active session:
--   [{"id": "q1", "type": "question", "skill_id": 12, "difficulty": 2, "facet": "procedural",
--     "public": {"prompt": "...", "format": "number"}, "key": {"accepted": ["0.25"], "solution": "..."}}]
-- The public part goes to study_sessions.items, which the student can read; the key goes to private.item_keys. An item
-- whose public part contains anything that looks like a key, at any depth, is refused.
create or replace function private.session_add_items(p_user uuid, p_session bigint, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.study_sessions;
  v_item jsonb;
  v_public jsonb;
  v_type text;
  v_skill bigint;
  v_count integer := 0;
begin
  select * into v_session from public.study_sessions s where s.id = p_session and s.user_id = p_user for update;
  if not found then
    raise exception 'session % is not this student''s', p_session using errcode = '42501';
  end if;
  if v_session.status <> 'active' then
    raise exception 'session % is closed', p_session using errcode = '55000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(v_session.items) + jsonb_array_length(p_items) > 60 then
    raise exception 'a session holds at most 60 items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_type := coalesce(v_item ->> 'type', 'question');
    v_public := v_item -> 'public';
    v_skill := (v_item ->> 'skill_id')::bigint;
    if v_type not in ('question', 'explanation') then
      raise exception 'unknown item type %', v_type using errcode = '22023';
    end if;
    if coalesce(v_item ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$' then
      raise exception 'item ids are 1 to 40 letters, digits, dashes or underscores' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_session.items) e where e ->> 'id' = v_item ->> 'id') then
      raise exception 'item % is already in the session', v_item ->> 'id' using errcode = '23505';
    end if;
    if v_public is null or jsonb_typeof(v_public) <> 'object' then
      raise exception 'item % has no public part', v_item ->> 'id' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_path_query(v_public, 'lax $.** ? (@.type() == "object").keyvalue().key') as k(name)
      where lower(k.name #>> '{}') in ('answer', 'answers', 'accepted', 'solution', 'worked_solution', 'rubric', 'key',
                                        'ideal_answer', 'idealanswer', 'correct', 'is_correct', 'expected')
    ) then
      raise exception 'item % carries an answer key in its public part', v_item ->> 'id' using errcode = '22023';
    end if;
    if v_skill is null or not exists (
      select 1 from public.skills s where s.id = v_skill and s.user_id = p_user
    ) then
      raise exception 'item % is not about one of this student''s skills', v_item ->> 'id' using errcode = '42501';
    end if;

    if v_type = 'question' then
      if v_item -> 'key' is null or jsonb_typeof(v_item -> 'key') <> 'object' then
        raise exception 'question % has no key', v_item ->> 'id' using errcode = '22023';
      end if;
      insert into private.item_keys (study_session_id, item_id, user_id, skill_id, difficulty, facet, key)
      values (p_session, v_item ->> 'id', p_user, v_skill, (v_item ->> 'difficulty')::smallint, v_item ->> 'facet',
              v_item -> 'key');
    elsif v_item -> 'key' is not null and v_item -> 'key' <> 'null'::jsonb then
      raise exception 'explanation % must not have a key', v_item ->> 'id' using errcode = '22023';
    end if;

    v_public := v_public || jsonb_build_object(
      'id', v_item ->> 'id', 'type', v_type, 'skill_id', v_skill,
      'difficulty', (v_item ->> 'difficulty')::smallint, 'facet', v_item ->> 'facet');
    update public.study_sessions
       set items = items || jsonb_build_array(v_public), last_active_at = now()
     where id = p_session
    returning * into v_session;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- A question and its key, for grading. Only the server calls it, and only for the student who owns the session.
create or replace function private.session_item(p_user uuid, p_session bigint, p_item text)
returns table (skill_id bigint, difficulty smallint, facet text, public jsonb, key jsonb, answered boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select k.skill_id, k.difficulty, k.facet,
         (select e.value from jsonb_array_elements(s.items) e where e.value ->> 'id' = p_item limit 1),
         k.key,
         exists (select 1 from public.session_events ev where ev.study_session_id = p_session and ev.item_id = p_item)
    from private.item_keys k
    join public.study_sessions s on s.id = k.study_session_id
   where k.study_session_id = p_session and k.item_id = p_item and k.user_id = p_user and s.user_id = p_user
$$;

-- Records one graded answer. The facts that decide whether it was independent come from the server; the item's skill,
-- difficulty and facet come from the stored key, never from the caller. Returns the new session_events id.
create or replace function private.record_attempt(p_user uuid, p_session bigint, p_item text, p_attempt jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.study_sessions;
  v_key private.item_keys;
  v_public jsonb;
  v_verdict text := p_attempt ->> 'verdict';
  v_hints smallint := coalesce((p_attempt ->> 'hints_used')::smallint, 0);
  v_explained boolean := coalesce((p_attempt ->> 'explained_before')::boolean, false);
  v_round smallint := coalesce((p_attempt ->> 'teaching_round')::smallint, 0);
  v_follows bigint := (p_attempt ->> 'follows_event_id')::bigint;
  v_source text := coalesce(p_attempt ->> 'source', 'quick_check');
  v_novel boolean;
  v_mode text;
  v_id bigint;
begin
  select * into v_session from public.study_sessions s where s.id = p_session and s.user_id = p_user for update;
  if not found then
    raise exception 'session % is not this student''s', p_session using errcode = '42501';
  end if;
  if v_session.status <> 'active' then
    raise exception 'session % is closed', p_session using errcode = '55000';
  end if;
  select * into v_key from private.item_keys k
   where k.study_session_id = p_session and k.item_id = p_item and k.user_id = p_user;
  if not found then
    raise exception 'item % is not a question in session %', p_item, p_session using errcode = '42501';
  end if;
  -- Whatever the caller says, an explanation of this skill earlier in the session makes the attempt assisted. Items
  -- are only ever appended, so an explanation already in the list was shown before this answer.
  v_explained := v_explained or exists (
    select 1 from jsonb_array_elements(v_session.items) e
     where e.value ->> 'type' = 'explanation' and (e.value ->> 'skill_id')::bigint = v_key.skill_id
  );
  if v_verdict is null or v_verdict not in ('correct', 'partial', 'incorrect', 'unclear') then
    raise exception 'unknown verdict %', v_verdict using errcode = '22023';
  end if;
  if v_source not in ('quick_check', 'practice', 'reassessment') then
    raise exception 'unknown source %', v_source using errcode = '22023';
  end if;
  if v_round > 0 and not v_explained then
    raise exception 'a practice round always follows an explanation' using errcode = '22023';
  end if;
  if v_follows is not null and not exists (
    select 1 from public.session_events e
     where e.id = v_follows and e.study_session_id = p_session and e.user_id = p_user
  ) then
    raise exception 'event % is not in this session', v_follows using errcode = '42501';
  end if;

  v_novel := not exists (
    select 1 from public.session_events e where e.study_session_id = p_session and e.item_id = p_item
  );
  v_mode := case when v_hints = 0 and not v_explained and v_novel and v_round = 0 then 'independent' else 'assisted' end;
  select e.value into v_public from jsonb_array_elements(v_session.items) e where e.value ->> 'id' = p_item limit 1;

  insert into public.session_events (
    user_id, course_id, segment_index, question, answer, correct, time_to_answer_seconds,
    skill_id, study_session_id, item_id, source, item, difficulty, facet, hints_used, explained_before, novel,
    attempt_mode, teaching_round, follows_event_id, verdict, rubric_met, rubric_total, grader, grader_version,
    double_graded, needs_review, grade_confidence, error_tag
  ) values (
    p_user, null, null, left(v_public ->> 'prompt', 2000), left(p_attempt ->> 'answer', 2000), v_verdict = 'correct',
    (p_attempt ->> 'time_to_answer_seconds')::integer,
    v_key.skill_id, p_session, p_item, v_source,
    jsonb_build_object('asked', v_public, 'solution', v_key.key -> 'solution'),
    v_key.difficulty, v_key.facet, v_hints, v_explained, v_novel, v_mode, v_round, v_follows, v_verdict,
    (p_attempt ->> 'rubric_met')::smallint, (p_attempt ->> 'rubric_total')::smallint,
    p_attempt ->> 'grader', left(p_attempt ->> 'grader_version', 80),
    (p_attempt ->> 'double_graded')::boolean, coalesce((p_attempt ->> 'needs_review')::boolean, false),
    (p_attempt ->> 'grade_confidence')::real, left(p_attempt ->> 'error_tag', 80)
  )
  returning id into v_id;

  update private.item_keys set revealed_at = coalesce(revealed_at, now())
   where study_session_id = p_session and item_id = p_item;
  update public.study_sessions
     set last_active_at = now(),
         active_seconds = least(86400, greatest(active_seconds,
                                                coalesce((p_attempt ->> 'active_seconds')::integer, active_seconds)))
   where id = p_session;
  return v_id;
end
$$;

create or replace function private.session_finish(
  p_user uuid,
  p_session bigint,
  p_status text,
  p_summary jsonb,
  p_active_seconds integer default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('completed', 'stopped') then
    raise exception 'unknown status %', p_status using errcode = '22023';
  end if;
  update public.study_sessions
     set status = p_status,
         summary = p_summary,
         ended_at = now(),
         last_active_at = now(),
         active_seconds = least(86400, greatest(active_seconds, coalesce(p_active_seconds, active_seconds)))
   where id = p_session and user_id = p_user and status = 'active';
  if not found then
    raise exception 'session % is not an active session of this student', p_session using errcode = '42501';
  end if;
end
$$;

-- Materials ------------------------------------------------------------------------------------------------------

-- The upload passed validation and was moved to its final key. Returns that key.
create or replace function private.material_accept_upload(p_user uuid, p_material bigint, p_bytes integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'materials/' || p_user::text || '/' || p_material::text;
begin
  update public.materials
     set storage_key = v_key, byte_size = p_bytes, status = 'uploaded', failure = null
   where id = p_material and user_id = p_user and status = 'pending';
  if not found then
    raise exception 'material % is not a pending upload of this student', p_material using errcode = '42501';
  end if;
  return v_key;
end
$$;

create or replace function private.material_reject_upload(p_user uuid, p_material bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.materials set status = 'failed', failure = left(p_reason, 200)
   where id = p_material and user_id = p_user and status in ('pending', 'uploaded');
  if not found then
    raise exception 'material % is not this student''s', p_material using errcode = '42501';
  end if;
end
$$;

create or replace function private.material_save_text(p_user uuid, p_material bigint, p_text text, p_pages jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.materials set text = p_text, pages = coalesce(p_pages, '[]'::jsonb), status = 'extracted'
   where id = p_material and user_id = p_user and status in ('uploaded', 'extracted');
  if not found then
    raise exception 'material % has no accepted file' , p_material using errcode = '42501';
  end if;
end
$$;

-- Deletes the row after the server removed the file. Returns the key the file had, so a retry can check it's gone.
create or replace function private.material_forget(p_user uuid, p_material bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  delete from public.materials where id = p_material and user_id = p_user returning storage_key into v_key;
  if not found then
    raise exception 'material % is not this student''s', p_material using errcode = '42501';
  end if;
  return v_key;
end
$$;

-- Account deletion -----------------------------------------------------------------------------------------------

create or replace function private.account_deletions_pending(p_limit integer default 20)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.user_id from private.account_deletions d
   where d.files_deleted_at is null
   order by d.requested_at
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

create or replace function private.account_files_deleted(p_user uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.account_deletions
     set attempts = attempts + 1,
         last_error = left(p_error, 300),
         files_deleted_at = case when p_error is null then now() else null end
   where user_id = p_user;
  delete from private.account_deletions where files_deleted_at < now() - interval '30 days';
end
$$;

-- Privileges -----------------------------------------------------------------------------------------------------

revoke all on all tables in schema private from public;
revoke all on all functions in schema private from public;
grant execute on function private.usage_reserve(uuid, text, text, text, numeric, text, bigint) to lyceo_server;
grant execute on function private.usage_settle(bigint, boolean, numeric, integer, integer, integer, integer, integer,
                                               numeric, integer, boolean) to lyceo_server;
grant execute on function private.session_start(uuid, bigint, text, bigint[], text) to lyceo_server;
grant execute on function private.session_add_items(uuid, bigint, jsonb) to lyceo_server;
grant execute on function private.session_item(uuid, bigint, text) to lyceo_server;
grant execute on function private.record_attempt(uuid, bigint, text, jsonb) to lyceo_server;
grant execute on function private.session_finish(uuid, bigint, text, jsonb, integer) to lyceo_server;
grant execute on function private.material_accept_upload(uuid, bigint, integer) to lyceo_server;
grant execute on function private.material_reject_upload(uuid, bigint, text) to lyceo_server;
grant execute on function private.material_save_text(uuid, bigint, text, jsonb) to lyceo_server;
grant execute on function private.material_forget(uuid, bigint) to lyceo_server;
grant execute on function private.account_deletions_pending(integer) to lyceo_server;
grant execute on function private.account_files_deleted(uuid, text) to lyceo_server;
