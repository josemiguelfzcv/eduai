-- 0006 · Hints the server counts, answers that can be clarified once, and a material's finished map.
--
-- STAGING ONLY until the schema review is approved. scripts/db/migrate.mjs refuses to run it against production.
--
-- Hints. A question's hints live in its key (key.hints, an array of strings), so the browser can't read them ahead of
-- time. The server shows them one at a time through private.reveal_hint, which counts them, and record_attempt takes
-- the larger of that count and what the caller reports: an answer given after a hint is assisted whatever the caller
-- says.
--
-- Unclear answers. An answer the grader can't read as one answer ("0.25 or 0.5?") doesn't count either way. It
-- reveals nothing: its row doesn't carry the solution, and the key isn't marked revealed, so the student can clarify
-- it once and that clarification is their real answer. A second unclear answer ends the question and shows the
-- solution. Any other second answer to the same question is refused (23505), so a request sent twice can't record
-- the same answer twice.
--
-- Materials. private.material_mark_mapped records that the skill map was written (status 'mapped').

alter table private.item_keys
  add column if not exists hints_revealed smallint not null default 0 check (hints_revealed between 0 and 10);

-- A question and its key, for grading, now with how many answers it has and how many hints were shown. The return
-- type changes, so the function is dropped and created again, and its grant restored below.
drop function if exists private.session_item(uuid, bigint, text);
create function private.session_item(p_user uuid, p_session bigint, p_item text)
returns table (
  skill_id bigint, difficulty smallint, facet text, public jsonb, key jsonb,
  -- A final answer exists: anything but an unclear first answer.
  answered boolean,
  unclear_answers integer,
  hints_revealed smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.skill_id, k.difficulty, k.facet,
         (select e.value from jsonb_array_elements(s.items) e where e.value ->> 'id' = p_item limit 1),
         k.key,
         exists (select 1 from public.session_events ev
                  where ev.study_session_id = p_session and ev.item_id = p_item
                    and (ev.verdict <> 'unclear' or ev.item ? 'solution')),
         (select count(*)::integer from public.session_events ev
           where ev.study_session_id = p_session and ev.item_id = p_item and ev.verdict = 'unclear'),
         k.hints_revealed
    from private.item_keys k
    join public.study_sessions s on s.id = k.study_session_id
   where k.study_session_id = p_session and k.item_id = p_item and k.user_id = p_user and s.user_id = p_user
$$;

-- Shows the next hint of a question the student hasn't answered yet, and counts it. When the question has no hint
-- left, returns a null hint and changes nothing.
create or replace function private.reveal_hint(p_user uuid, p_session bigint, p_item text)
returns table (hint text, shown smallint, remaining smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.study_sessions;
  v_key private.item_keys;
  v_hints jsonb;
  v_total smallint;
begin
  select * into v_session from public.study_sessions s where s.id = p_session and s.user_id = p_user for update;
  if not found then
    raise exception 'session % is not this student''s', p_session using errcode = '42501';
  end if;
  if v_session.status <> 'active' then
    raise exception 'session % is closed', p_session using errcode = '55000';
  end if;
  select * into v_key from private.item_keys k
   where k.study_session_id = p_session and k.item_id = p_item and k.user_id = p_user
     for update;
  if not found then
    raise exception 'item % is not a question in session %', p_item, p_session using errcode = '42501';
  end if;
  if exists (select 1 from public.session_events e
              where e.study_session_id = p_session and e.item_id = p_item
                and (e.verdict <> 'unclear' or e.item ? 'solution')) then
    raise exception 'item % was already answered', p_item using errcode = '23505';
  end if;

  v_hints := case when jsonb_typeof(v_key.key -> 'hints') = 'array' then v_key.key -> 'hints' else '[]'::jsonb end;
  v_total := least(jsonb_array_length(v_hints), 10);
  if v_key.hints_revealed >= v_total then
    return query select null::text, v_key.hints_revealed, 0::smallint;
    return;
  end if;

  update private.item_keys set hints_revealed = v_key.hints_revealed + 1
   where study_session_id = p_session and item_id = p_item;
  update public.study_sessions set last_active_at = now() where id = p_session;
  return query select left(v_hints ->> v_key.hints_revealed::integer, 500),
                      (v_key.hints_revealed + 1)::smallint,
                      (v_total - v_key.hints_revealed - 1)::smallint;
end
$$;

-- Records one graded answer. Unchanged from 0005 except for hints (counted by the server), clarifications of unclear
-- answers, and refusing a second answer. CREATE OR REPLACE keeps the function's owner and its grant to lyceo_server.
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
  v_unclear integer;
  v_final integer;
  v_reveals boolean;
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
  -- Whatever the caller says, a hint the server showed for this question makes it assisted.
  v_hints := greatest(v_hints, v_key.hints_revealed);
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

  -- One real answer per question: the first answer, or the clarification of an unclear one. A question whose answer
  -- revealed its solution (any verdict but a first unclear) takes nothing more.
  select count(*) filter (where e.verdict = 'unclear' and not (e.item ? 'solution')),
         count(*) filter (where e.verdict <> 'unclear' or e.item ? 'solution')
    into v_unclear, v_final
    from public.session_events e where e.study_session_id = p_session and e.item_id = p_item;
  if v_final > 0 then
    raise exception 'item % was already answered', p_item using errcode = '23505';
  end if;
  -- A first unclear answer reveals nothing; anything else shows the solution.
  v_reveals := v_verdict <> 'unclear' or v_unclear > 0;
  -- novel: the first answer to this question at all. A clarification isn't novel, but the unclear answer before it
  -- revealed nothing, so it can still be independent.
  v_novel := v_unclear = 0;
  v_mode := case when v_hints = 0 and not v_explained and v_round = 0 then 'independent' else 'assisted' end;
  select e.value into v_public from jsonb_array_elements(v_session.items) e where e.value ->> 'id' = p_item limit 1;

  -- session_events references the student's profile row (public.users), which the app writes from the dashboard.
  -- Create it if it's missing, as 0005 does.
  insert into public.users (id, email)
  select u.id, u.email from auth.users u where u.id = p_user
  on conflict (id) do nothing;

  insert into public.session_events (
    user_id, course_id, segment_index, question, answer, correct, time_to_answer_seconds,
    skill_id, study_session_id, item_id, source, item, difficulty, facet, hints_used, explained_before, novel,
    attempt_mode, teaching_round, follows_event_id, verdict, rubric_met, rubric_total, grader, grader_version,
    double_graded, needs_review, grade_confidence, error_tag
  ) values (
    p_user, null, null, left(v_public ->> 'prompt', 2000), left(p_attempt ->> 'answer', 2000), v_verdict = 'correct',
    (p_attempt ->> 'time_to_answer_seconds')::integer,
    v_key.skill_id, p_session, p_item, v_source,
    case when v_reveals then jsonb_build_object('asked', v_public, 'solution', v_key.key -> 'solution')
         else jsonb_build_object('asked', v_public) end,
    v_key.difficulty, v_key.facet, v_hints, v_explained, v_novel, v_mode, v_round, v_follows, v_verdict,
    (p_attempt ->> 'rubric_met')::smallint, (p_attempt ->> 'rubric_total')::smallint,
    p_attempt ->> 'grader', left(p_attempt ->> 'grader_version', 80),
    (p_attempt ->> 'double_graded')::boolean, coalesce((p_attempt ->> 'needs_review')::boolean, false),
    (p_attempt ->> 'grade_confidence')::real, left(p_attempt ->> 'error_tag', 80)
  )
  returning id into v_id;

  if v_reveals then
    update private.item_keys set revealed_at = coalesce(revealed_at, now())
     where study_session_id = p_session and item_id = p_item;
  end if;
  update public.study_sessions
     set last_active_at = now(),
         active_seconds = least(86400, greatest(active_seconds,
                                                coalesce((p_attempt ->> 'active_seconds')::integer, active_seconds)))
   where id = p_session;
  return v_id;
end
$$;

-- The skill map of a material with extracted text was written.
create or replace function private.material_mark_mapped(p_user uuid, p_material bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.materials set status = 'mapped'
   where id = p_material and user_id = p_user and status in ('extracted', 'mapped');
  if not found then
    raise exception 'material % has no extracted text', p_material using errcode = '42501';
  end if;
end
$$;

-- Keeps the session's active time current between answers (the browser reports it while the student reads an
-- explanation or a hint). Never lowers it.
create or replace function private.session_touch(p_user uuid, p_session bigint, p_active_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.study_sessions
     set last_active_at = now(),
         active_seconds = least(86400, greatest(active_seconds, coalesce(p_active_seconds, active_seconds)))
   where id = p_session and user_id = p_user and status = 'active';
  if not found then
    raise exception 'session % is not an active session of this student', p_session using errcode = '42501';
  end if;
end
$$;

-- New functions are executable by everyone until revoked (see 0003).
revoke all on function private.session_item(uuid, bigint, text) from public;
revoke all on function private.reveal_hint(uuid, bigint, text) from public;
revoke all on function private.material_mark_mapped(uuid, bigint) from public;
revoke all on function private.session_touch(uuid, bigint, integer) from public;
grant execute on function private.session_item(uuid, bigint, text) to lyceo_server;
grant execute on function private.reveal_hint(uuid, bigint, text) to lyceo_server;
grant execute on function private.material_mark_mapped(uuid, bigint) to lyceo_server;
grant execute on function private.session_touch(uuid, bigint, integer) to lyceo_server;
