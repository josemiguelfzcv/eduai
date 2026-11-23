-- 0005: an answer is saved even when the student has no profile row yet.
--
-- public.session_events, from the original app, references public.users (the profile). The app writes that row from
-- the dashboard and the profile page, so a student who reached a study session without opening the dashboard had
-- none, and private.record_attempt failed with a foreign-key error (23503): the answer was lost. Found on staging,
-- where the test students had never opened the app.
--
-- record_attempt now creates the missing row with the student's id and email, as the dashboard would. Everything
-- else is unchanged from 0003. CREATE OR REPLACE keeps the function's owner and its grant to lyceo_server.

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

  -- The original app's profile row, which session_events references: create it if the app hasn't yet.
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
