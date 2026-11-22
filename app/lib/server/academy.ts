import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEADLINE_KINDS,
  buildLessonProgress,
  datedDeadlines,
  planToday,
  summarizeCourses,
  type AcademyCourse,
  type AcademySnapshot,
  type CourseDetail,
  type CheckIn,
  type Deadline,
  type DeadlineKind,
  type LessonRecord,
} from '../academy'
import { HttpError } from './auth'
import { computeLearner, summarizeLearner, type EventRow, type ProfileRow } from './learner'

export const SETUP_MESSAGE =
  'My Academy needs a one-time database update. Run supabase/migrations/0001_my_academy.sql in the Supabase SQL editor.'

type DbError = { code?: string; message?: string } | null

function isMissingSchema(error: DbError) {
  if (!error) return false
  return (
    ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '') ||
    /academy_course|deadlines|schema cache/i.test(error.message ?? '')
  )
}

/** Unwraps a Supabase result, turning "table or column doesn't exist" into a clear setup error. */
export function rows<T>(result: { data: T | null; error: DbError }): T {
  if (result.error) {
    if (isMissingSchema(result.error)) throw new HttpError(503, SETUP_MESSAGE)
    throw result.error
  }
  return result.data as T
}

export const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

/** The student's local date, sent by the browser; falls back to the server's UTC date. */
export function todayFrom(req: Request) {
  const t = new URL(req.url).searchParams.get('today')
  return isIsoDate(t) ? t : new Date().toISOString().slice(0, 10)
}

type CourseRow = { id: number; name: string; code: string | null; term: string | null; created_at: string }
type DeadlineRow = {
  id: number
  course_id: number
  title: string
  kind: DeadlineKind
  due_on: string
  topics: string | null
  completed_at: string | null
}
type LessonRow = {
  id: number
  title: string | null
  created_at: string
  academy_course_id: number | null
  script: unknown
}

export const toCourse = (row: unknown): AcademyCourse => {
  const r = row as CourseRow
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    term: r.term,
    createdAt: r.created_at,
  }
}

export const toDeadline = (row: unknown): Deadline => {
  const r = row as DeadlineRow
  return {
    id: r.id,
    courseId: r.course_id,
    title: r.title,
    kind: r.kind,
    dueOn: r.due_on,
    topics: r.topics,
    completedAt: r.completed_at,
  }
}

/** Everything My Academy needs, in one round of parallel queries. */
export async function loadAcademyData(db: SupabaseClient, userId: string) {
  const [courses, deadlines, lessons, events, profile] = await Promise.all([
    db
      .from('academy_courses')
      .select('id, name, code, term, created_at')
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
    db
      .from('deadlines')
      .select('id, course_id, title, kind, due_on, topics, completed_at')
      .eq('user_id', userId)
      .order('due_on', { ascending: true }),
    db
      .from('courses')
      .select('id, title, created_at, academy_course_id, script')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    db
      .from('session_events')
      .select('course_id, segment_index, correct, time_to_answer_seconds, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(5000),
    db.from('users').select('career, learning_style').eq('id', userId).maybeSingle(),
  ])

  const lessonRows = rows(lessons) as LessonRow[]
  const eventRows = (rows(events) ?? []) as EventRow[]
  return {
    courses: (rows(courses) as CourseRow[]).map(toCourse),
    deadlines: (rows(deadlines) as DeadlineRow[]).map(toDeadline),
    lessonRecords: lessonRows.map((l): LessonRecord => ({
      id: l.id,
      title: l.title,
      createdAt: l.created_at,
      courseId: l.academy_course_id,
      script: l.script,
    })),
    lessonRows,
    events: eventRows,
    profile: (profile.data ?? null) as ProfileRow,
  }
}

type AcademyData = Awaited<ReturnType<typeof loadAcademyData>>

function derive(data: AcademyData, today: string) {
  const checkIns: CheckIn[] = data.events.map((e) => ({
    lessonId: e.course_id,
    part: e.segment_index,
    correct: e.correct,
    at: e.created_at,
  }))
  const lessons = buildLessonProgress(data.lessonRecords, checkIns)
  const deadlines = datedDeadlines(data.deadlines, data.courses, today)
  const courses = summarizeCourses(data.courses, lessons, deadlines)
  return { lessons, deadlines, courses }
}

export function buildSnapshot(data: AcademyData, today: string): AcademySnapshot {
  const { lessons, deadlines, courses } = derive(data, today)
  const known = new Set(data.courses.map((c) => c.id))
  const learner = computeLearner(data.profile, data.events, data.lessonRows)
  return {
    today,
    plan: planToday({ today, courses: data.courses, deadlines, lessons }),
    deadlines: deadlines.filter((d) => !d.completedAt && d.daysLeft >= -3),
    courses,
    unsorted: lessons.filter((l) => (l.courseId === null || !known.has(l.courseId)) && l.status !== 'not-ready'),
    learner: summarizeLearner(learner),
  }
}

export function buildCourseDetail(data: AcademyData, courseId: number, today: string): CourseDetail {
  const { lessons, deadlines, courses } = derive(data, today)
  const course = courses.find((c) => c.id === courseId)
  if (!course) throw new HttpError(404, 'That course does not exist or is not yours.')
  const own = lessons.filter((l) => l.courseId === courseId)
  const ownDeadlines = deadlines.filter((d) => d.courseId === courseId)
  return {
    today,
    course,
    plan: planToday(
      { today, courses: data.courses, deadlines: ownDeadlines, lessons: own },
      { maxActions: 3, minuteBudget: 60 },
    ).filter((a) => a.courseId === courseId),
    lessons: own,
    deadlines: ownDeadlines,
    courses: data.courses,
  }
}

export async function assertOwnCourse(db: SupabaseClient, userId: string, courseId: unknown) {
  const id = Number(courseId)
  if (!Number.isInteger(id)) throw new HttpError(400, 'Choose a course.')
  const found = rows(await db.from('academy_courses').select('id').eq('id', id).eq('user_id', userId).maybeSingle())
  if (!found) throw new HttpError(404, 'That course does not exist or is not yours.')
  return id
}

/** Trims a text field and enforces a length; empty becomes null unless required. */
export function text(value: unknown, field: string, max: number, required = false): string | null {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) {
    if (required) throw new HttpError(400, `${field} is required.`)
    return null
  }
  if (v.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`)
  return v
}

export const DEADLINE_COLUMNS = 'id, course_id, title, kind, due_on, topics, completed_at'

export function deadlineKind(value: unknown): DeadlineKind {
  const kind = DEADLINE_KINDS.find((k) => k.id === value)
  if (!kind) throw new HttpError(400, 'Choose exam, quiz, assignment, project or other.')
  return kind.id
}

export function dueDate(value: unknown) {
  if (!isIsoDate(value)) throw new HttpError(400, 'Choose a due date.')
  return value
}
