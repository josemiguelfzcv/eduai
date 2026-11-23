import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { planToday } from '../academy'
import { addDays, localDay, skillState, type Facet, type SkillState, type Verdict } from '../mastery'
import { skillActions, type MaterialInfo, type SessionInfo, type SkillInfo } from '../next-step'
import { splitPages, type PageText } from '../skill-map'
import { buildSummary, sessionProgress, type SessionAnswer, type SessionItem, type SessionSummary } from '../study'
import { HttpError } from './auth'
import { privateUploadsEnabled } from './materials'
import { serverRecordsEnabled } from './records'
import type { SkillContext } from './learning'

// The learning loop's data, read with the student's own session (row-level security), and what it adds up to: each
// skill's state, the next steps, a session as the student sees it, and its closure.

/** On where both the private bucket and the server's database connection are configured: staging today. */
export function learningLoopEnabled() {
  return privateUploadsEnabled() && serverRecordsEnabled()
}

export function requireLearningLoop() {
  if (!learningLoopEnabled()) throw new HttpError(404, 'This part of Lyceo is not available yet.')
}

type DbResult<T> = { data: T | null; error: { message: string; code?: string } | null }
function must<T>(r: DbResult<T>): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

import type { JoinedIdea } from '../views'
export type { JoinedIdea }
export type SkillRow = {
  id: number
  academy_course_id: number
  name: string
  objective: string | null
  facets: Facet[]
  status: 'active' | 'hidden' | 'merged'
  merged_into: number | null
  confirmed_at: string | null
  created_at: string
}
export type SourceRow = {
  id: number
  skill_id: number
  material_id: number | null
  lesson_id: number | null
  locator: { pages?: number[]; joined?: JoinedIdea }
  quote: string | null
  origin: 'extracted' | 'inferred' | 'student'
}
export type MaterialRow = {
  id: number
  title: string
  kind: string
  academy_course_id: number | null
  status: string
  policy: 'study' | 'graded'
  failure: string | null
  created_at: string
}
export type SessionRow = {
  id: number
  academy_course_id: number | null
  mode: string
  status: 'active' | 'completed' | 'stopped'
  items: SessionItem[]
  active_seconds: number
  started_at: string
  last_active_at: string
  ended_at: string | null
  summary: SessionSummary | null
}
type EventRow = {
  id: number
  skill_id: number
  study_session_id: number
  item_id: string
  created_at: string
  verdict: Verdict
  attempt_mode: 'independent' | 'assisted'
  difficulty: number
  facet: Facet
  grader: string | null
  double_graded: boolean | null
  needs_review: boolean
  hints_used: number
  explained_before: boolean | null
  teaching_round: number | null
  error_tag: string | null
  answer: string | null
  solution: string | null
}

const SKILL_COLUMNS = 'id, academy_course_id, name, objective, facets, status, merged_into, confirmed_at, created_at'
const MATERIAL_COLUMNS = 'id, title, kind, academy_course_id, status, policy, failure, created_at'
const SESSION_COLUMNS =
  'id, academy_course_id, mode, status, items, active_seconds, started_at, last_active_at, ended_at, summary'
const EVENT_COLUMNS =
  'id, skill_id, study_session_id, item_id, created_at, verdict, attempt_mode, difficulty, facet, grader, double_graded, needs_review, hints_used, explained_before, teaching_round, error_tag, answer, solution:item->>solution'

function toAnswer(e: EventRow, skillId: number, tz: string | null): SessionAnswer {
  return {
    skillId,
    sessionId: e.study_session_id,
    itemId: e.item_id,
    at: e.created_at,
    day: localDay(e.created_at, tz),
    verdict: e.verdict,
    mode: e.attempt_mode,
    difficulty: e.difficulty,
    facet: e.facet,
    grader: e.grader,
    doubleGraded: e.double_graded,
    needsReview: e.needs_review,
    hintsUsed: e.hints_used,
    explainedBefore: !!e.explained_before,
    teachingRound: e.teaching_round ?? 0,
    errorTag: e.error_tag,
    eventId: e.id,
    answer: e.answer ?? '',
    solution: e.solution,
    final: e.verdict !== 'unclear' || e.solution !== null,
  }
}

/** The skill a skill's evidence counts for: itself, the skill it was merged into, or none if hidden. */
function targetOf(skills: Map<number, SkillRow>, id: number): number | null {
  let s = skills.get(id)
  for (let depth = 0; s && depth < 4; depth++) {
    if (s.status === 'active') return s.id
    if (s.status !== 'merged' || s.merged_into === null) return null
    s = skills.get(s.merged_into)
  }
  return null
}

export type Learning = Awaited<ReturnType<typeof loadLearning>>

/** Everything the next steps and closures need. `courseId` limits it to one course. */
export async function loadLearning(
  db: SupabaseClient,
  opts: { courseId?: number | null; tz: string | null; today: string; now?: Date },
) {
  const course = opts.courseId ?? null
  let skillsQ = db.from('skills').select(SKILL_COLUMNS)
  let materialsQ = db.from('materials').select(MATERIAL_COLUMNS)
  let sessionsQ = db.from('study_sessions').select(SESSION_COLUMNS)
  if (course !== null) {
    skillsQ = skillsQ.eq('academy_course_id', course)
    materialsQ = materialsQ.eq('academy_course_id', course)
    sessionsQ = sessionsQ.eq('academy_course_id', course)
  }
  const [skillsRes, sourcesRes, materialsRes, sessionsRes, eventsRes] = await Promise.all([
    skillsQ.order('created_at'),
    db.from('skill_sources').select('id, skill_id, material_id, lesson_id, locator, quote, origin').order('id'),
    materialsQ.order('created_at', { ascending: false }),
    sessionsQ.order('last_active_at', { ascending: false }).limit(30),
    db.from('session_events').select(EVENT_COLUMNS).not('skill_id', 'is', null).order('created_at').limit(5000),
  ])
  const skillRows = must(skillsRes as DbResult<SkillRow[]>)
  const skills = new Map(skillRows.map((s) => [s.id, s]))
  const sources = must(sourcesRes as DbResult<SourceRow[]>).filter((s) => skills.has(s.skill_id))
  const materials = must(materialsRes as DbResult<MaterialRow[]>)
  const sessions = must(sessionsRes as DbResult<SessionRow[]>)
  const events = must(eventsRes as DbResult<EventRow[]>)

  // Every answer stays in its session; for mastery it counts toward the skill it now belongs to (a merged skill's
  // answers count for the skill it was merged into; a hidden skill's, for none, since no active skill has its id).
  const answers: SessionAnswer[] = events.map((e) => toAnswer(e, targetOf(skills, e.skill_id) ?? e.skill_id, opts.tz))
  const active = skillRows.filter((s) => s.status === 'active')
  const statesOn = (day: string) =>
    new Map<number, SkillState>(
      active.map((s) => [
        s.id,
        skillState(
          { id: s.id, facets: s.facets },
          answers.filter((a) => a.skillId === s.id),
          day,
        ),
      ]),
    )
  const states = statesOn(opts.today)
  return {
    skills,
    active,
    sources,
    materials,
    sessions,
    answers,
    events,
    states,
    statesOn,
    tz: opts.tz,
    today: opts.today,
  }
}

export function skillInfos(l: Learning, states = l.states): SkillInfo[] {
  return l.active.map((s) => ({
    id: s.id,
    name: s.name,
    courseId: s.academy_course_id,
    facets: s.facets,
    state: states.get(s.id)!,
  }))
}

export function materialInfos(l: Learning): MaterialInfo[] {
  return l.materials.map((m) => ({
    id: m.id,
    title: m.title,
    courseId: m.academy_course_id,
    status: m.status,
    createdAt: m.created_at,
    skillIds: [
      ...new Set(
        l.sources
          .filter((s) => s.material_id === m.id)
          .map((s) => targetOf(l.skills, s.skill_id))
          .filter((id): id is number => id !== null),
      ),
    ],
  }))
}

export function sessionAnswers(l: Learning, sessionId: number) {
  return l.answers.filter((a) => a.sessionId === sessionId)
}

export function sessionInfos(l: Learning): SessionInfo[] {
  return l.sessions.map((s) => ({
    id: s.id,
    courseId: s.academy_course_id,
    status: s.status,
    lastActiveAt: s.last_active_at,
    remaining: sessionProgress(s.items, sessionAnswers(l, s.id)).remaining,
  }))
}

/** The learning loop's candidate steps for My Academy. */
export function learningActions(
  l: Learning,
  courseNames: Map<number, string>,
  deadlines: Parameters<typeof skillActions>[0]['deadlines'],
  now = new Date(),
) {
  return skillActions({
    today: l.today,
    now,
    courseNames,
    deadlines,
    skills: skillInfos(l),
    materials: materialInfos(l),
    sessions: sessionInfos(l),
  })
}

/** Tomorrow's first step for one course, from the evidence as it stands now. */
export function tomorrowFor(l: Learning, courseId: number | null, courseNames: Map<number, string>) {
  const tomorrow = addDays(l.today, 1)
  const states = l.statesOn(tomorrow)
  const extra = skillActions({
    today: tomorrow,
    now: new Date(Date.now() + 24 * 3_600_000),
    courseNames,
    deadlines: [],
    skills: skillInfos(l, states).filter((s) => courseId === null || s.courseId === courseId),
    materials: materialInfos(l).filter((m) => courseId === null || m.courseId === courseId),
    sessions: [],
  })
  const [first] = planToday({ today: tomorrow, courses: [], deadlines: [], lessons: [], extra })
  return first ? { title: first.title, minutes: first.minutes } : null
}

export function summaryOf(l: Learning, session: SessionRow, courseNames: Map<number, string>, finished: boolean) {
  if (session.status === 'completed' && session.summary) return session.summary
  const names = new Map([...l.skills.values()].map((s) => [s.id, s.name]))
  return buildSummary({
    courseName: session.academy_course_id === null ? null : (courseNames.get(session.academy_course_id) ?? null),
    activeSeconds: session.active_seconds,
    items: session.items,
    answers: sessionAnswers(l, session.id),
    skillNames: names,
    states: l.states,
    tomorrow: tomorrowFor(l, session.academy_course_id, courseNames),
    finished,
  })
}

export async function courseNamesOf(db: SupabaseClient) {
  const rows = must((await db.from('academy_courses').select('id, name')) as DbResult<{ id: number; name: string }[]>)
  return new Map(rows.map((r) => [r.id, r.name]))
}

// ---------- material text for prompts ----------

/** The pages of the student's materials that each skill comes from, for writing questions and explanations. */
export async function skillContexts(
  db: SupabaseClient,
  skills: SkillRow[],
  sources: SourceRow[],
  { pagesPerSkill = 2, charsPerPage = 1800 } = {},
): Promise<Map<number, SkillContext>> {
  const ids = new Set(skills.map((s) => s.id))
  const mine = sources.filter((s) => ids.has(s.skill_id) && s.material_id !== null)
  const materialIds = [...new Set(mine.map((s) => s.material_id!))]
  const texts = new Map<number, PageText[]>()
  if (materialIds.length) {
    const rows = must(
      (await db.from('materials').select('id, text, pages').in('id', materialIds)) as DbResult<
        { id: number; text: string | null; pages: { n: number; start: number }[] }[]
      >,
    )
    for (const r of rows) if (r.text) texts.set(r.id, splitPages(r.text, r.pages))
  }
  const out = new Map<number, SkillContext>()
  for (const s of skills) {
    const excerpts: SkillContext['excerpts'] = []
    for (const src of mine.filter((m) => m.skill_id === s.id)) {
      const pages = texts.get(src.material_id!) ?? []
      for (const n of src.locator.pages ?? []) {
        if (excerpts.length >= pagesPerSkill) break
        const page = pages.find((p) => p.n === n)
        if (page && !excerpts.some((e) => e.materialId === src.material_id && e.page === n))
          excerpts.push({
            materialId: src.material_id!,
            page: n,
            text: page.text.slice(0, charsPerPage),
            quote: src.quote,
          })
      }
    }
    out.set(s.id, { id: s.id, name: s.name, objective: s.objective, excerpts })
  }
  return out
}

export async function materialPages(db: SupabaseClient, materialId: number): Promise<PageText[]> {
  const row = must(
    (await db.from('materials').select('text, pages').eq('id', materialId).maybeSingle()) as DbResult<{
      text: string | null
      pages: { n: number; start: number }[]
    }>,
  )
  return row?.text ? splitPages(row.text, row.pages) : []
}

export async function loadSession(db: SupabaseClient, sessionId: number) {
  const row = must(
    (await db.from('study_sessions').select(SESSION_COLUMNS).eq('id', sessionId).maybeSingle()) as DbResult<SessionRow>,
  )
  if (!row) throw new HttpError(404, 'That session does not exist or is not yours.')
  return row
}
