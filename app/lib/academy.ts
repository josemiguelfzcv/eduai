// My Academy: courses, deadlines, lesson progress and the "What to study today" plan.
// Everything here is pure (no database, no clock) so it can be tested and improved in isolation.
// Dates are local calendar days as 'YYYY-MM-DD'; the browser sends its own "today".

import { normalizeLesson, type LearnerSummary } from './lesson'

import type { SkillStateName } from './mastery'
import type { SessionSummary } from './study'

export type DeadlineKind = 'exam' | 'quiz' | 'assignment' | 'project' | 'other'

export const DEADLINE_KINDS: { id: DeadlineKind; label: string }[] = [
  { id: 'exam', label: 'Exam' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'project', label: 'Project' },
  { id: 'other', label: 'Other' },
]

export type AcademyCourse = { id: number; name: string; code: string | null; term: string | null; createdAt: string }

export type Deadline = {
  id: number
  courseId: number
  title: string
  kind: DeadlineKind
  dueOn: string
  topics: string | null
  completedAt: string | null
}

export type DatedDeadline = Deadline & { daysLeft: number; courseName: string }

/** One check-in answer: which lesson, which part (0-based), whether it was right, when. */
export type CheckIn = { lessonId: number; part: number; correct: boolean; at: string }

/** A generated lesson as stored (one row of the "courses" table). */
export type LessonRecord = {
  id: number
  title: string | null
  createdAt: string
  courseId: number | null
  script: unknown
}

export type LessonProgress = {
  id: number
  title: string
  courseId: number | null
  kind: 'lesson' | 'review'
  sourceLessonId: number | null
  createdAt: string
  parts: number
  partsChecked: number
  firstTryCorrect: number
  /** Concepts answered wrong on the first try, most recent first. */
  missed: { concept: string; at: string }[]
  lastActivity: string | null
  /** 1-based part to pick up from, or null once the student reached the last part. */
  resumePart: number | null
  estimatedMinutes: number
  status: 'not-ready' | 'new' | 'in-progress' | 'done'
}

export type StudyActionKind =
  | 'review'
  | 'open-review'
  | 'continue'
  | 'start'
  | 'add-material'
  // From the learning loop: a paused Quick Check, and skills to confirm, practice, check for the first time or review.
  | 'resume'
  | 'confirm'
  | 'practice'
  | 'first-check'
  | 'review-skills'

export type StudyAction = {
  key: string
  kind: StudyActionKind
  title: string
  why: string
  minutes: number
  courseId: number | null
  courseName: string | null
  /** For 'review': the lesson to build a review from. Otherwise the lesson the button opens. */
  lessonId: number | null
  /** Where the button goes. Null for 'review', which first creates the review lesson, and for Quick Checks. */
  href: string | null
  /** For actions that start a Quick Check: its course and the skills it focuses on. */
  session?: { courseId: number; skillIds: number[] }
  priority: number
}

export type CourseSummary = AcademyCourse & {
  lessons: number
  conceptsChecked: number
  firstTryCorrect: number
  toReview: number
  nextDeadline: DatedDeadline | null
}

/** The closure of the latest Quick Check, for "Since last time". */
export type LastSession = {
  sessionId: number
  status: 'active' | 'completed' | 'stopped'
  courseName: string | null
  lastActiveAt: string
  summary: SessionSummary
}

/** A skill of a course with its mastery state, for the course page. */
export type IdeaSummary = {
  id: number
  name: string
  objective: string | null
  state: SkillStateName
  label: string
  reason: string
  next: string | null
}

export type MaterialSummary = {
  id: number
  title: string
  status: string
  failure: string | null
  createdAt: string
  ideas: number
}

export type AcademySnapshot = {
  today: string
  /** True where the learning loop (private materials, skill maps, Quick Checks) is on: staging today. */
  learningLoop?: boolean
  sinceLastTime?: LastSession | null
  plan: StudyAction[]
  /** Not completed, from three days ago onward. */
  deadlines: DatedDeadline[]
  courses: CourseSummary[]
  /** Lessons that don't belong to a course yet. */
  unsorted: LessonProgress[]
  learner: LearnerSummary
}

export type CourseDetail = {
  today: string
  learningLoop?: boolean
  ideas?: IdeaSummary[]
  materials?: MaterialSummary[]
  /** Every usable material in the course's order, lectures with their lesson's progress (learning environment). */
  lectures?: import('./views').LectureSummary[]
  course: CourseSummary
  plan: StudyAction[]
  lessons: LessonProgress[]
  /** Every deadline of the course, including past and completed ones. */
  deadlines: DatedDeadline[]
  courses: AcademyCourse[]
}

// ---------- dates ----------

const dayNumber = (isoDate: string) => {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Whole days from `from` to `to` (both 'YYYY-MM-DD' or ISO timestamps; only the date part is used). */
export const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from))

export function whenLabel(daysLeft: number) {
  if (daysLeft === 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  if (daysLeft === -1) return 'yesterday'
  return daysLeft > 0 ? `in ${daysLeft} days` : `${-daysLeft} days ago`
}

/** Today's date in the browser's time zone, as 'YYYY-MM-DD'. */
export function localToday(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function currentTerm(now = new Date()) {
  const m = now.getMonth()
  const season = m >= 7 ? 'Fall' : m <= 4 ? 'Spring' : 'Summer'
  return `${season} ${now.getFullYear()}`
}

// ---------- lesson progress ----------

export function buildLessonProgress(records: LessonRecord[], checkIns: CheckIn[]): LessonProgress[] {
  const byLesson = new Map<number, Map<number, CheckIn[]>>()
  for (const c of [...checkIns].sort((a, b) => a.at.localeCompare(b.at))) {
    const parts = byLesson.get(c.lessonId) ?? new Map<number, CheckIn[]>()
    parts.set(c.part, [...(parts.get(c.part) ?? []), c])
    byLesson.set(c.lessonId, parts)
  }

  return records.map((r) => {
    const lesson = normalizeLesson(r.script)
    const base = {
      id: r.id,
      courseId: r.courseId,
      createdAt: r.createdAt,
      kind: lesson?.meta?.kind === 'review' ? ('review' as const) : ('lesson' as const),
      sourceLessonId: lesson?.meta?.sourceCourseId ?? null,
    }
    if (!lesson) {
      return {
        ...base,
        title: r.title || 'Untitled lesson',
        parts: 0,
        partsChecked: 0,
        firstTryCorrect: 0,
        missed: [],
        lastActivity: null,
        resumePart: null,
        estimatedMinutes: 0,
        status: 'not-ready' as const,
      }
    }

    const parts = lesson.segments.length
    const questions = lesson.segments.filter((s) => s.check.question).length || parts
    const attempts = [...(byLesson.get(r.id) ?? new Map<number, CheckIn[]>()).entries()].filter(([p]) => p < parts)
    const missed = attempts
      .filter(([, a]) => !a[0].correct)
      .map(([p, a]) => ({ concept: lesson.segments[p].concept || `Part ${p + 1}`, at: a[0].at }))
      .sort((a, b) => b.at.localeCompare(a.at))
    const furthest = attempts.length ? Math.max(...attempts.map(([p]) => p)) : -1
    const resumePart = furthest < 0 ? 1 : furthest + 2 <= parts ? furthest + 2 : null
    const lastActivity =
      attempts
        .flatMap(([, a]) => a.map((c) => c.at))
        .sort()
        .pop() ?? null
    const status =
      attempts.length === 0
        ? ('new' as const)
        : resumePart === null || attempts.length >= Math.ceil(questions * 0.8)
          ? ('done' as const)
          : ('in-progress' as const)

    return {
      ...base,
      title: lesson.title || r.title || 'Untitled lesson',
      parts,
      partsChecked: attempts.length,
      firstTryCorrect: attempts.filter(([, a]) => a[0].correct).length,
      missed,
      lastActivity,
      resumePart,
      estimatedMinutes: lesson.estimatedMinutes,
      status,
    }
  })
}

/**
 * First-try misses that still need a review: the lesson is finished, and no review lesson
 * has been created for it since the most recent miss.
 */
export function pendingReview(lesson: LessonProgress, all: LessonProgress[]) {
  if (lesson.status !== 'done' || lesson.missed.length === 0) return []
  const lastMiss = lesson.missed[0].at
  const reviewed = all.some((r) => r.kind === 'review' && r.sourceLessonId === lesson.id && r.createdAt >= lastMiss)
  return reviewed ? [] : lesson.missed
}

// ---------- deadlines and courses ----------

export function datedDeadlines(deadlines: Deadline[], courses: AcademyCourse[], today: string): DatedDeadline[] {
  const names = new Map(courses.map((c) => [c.id, c.name]))
  return deadlines
    .filter((d) => names.has(d.courseId))
    .map((d) => ({ ...d, daysLeft: daysBetween(today, d.dueOn), courseName: names.get(d.courseId)! }))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id - b.id)
}

export function summarizeCourses(
  courses: AcademyCourse[],
  lessons: LessonProgress[],
  deadlines: DatedDeadline[],
): CourseSummary[] {
  return courses.map((c) => {
    const own = lessons.filter((l) => l.courseId === c.id && l.status !== 'not-ready')
    return {
      ...c,
      lessons: own.filter((l) => l.kind === 'lesson').length,
      conceptsChecked: own.reduce((n, l) => n + l.partsChecked, 0),
      firstTryCorrect: own.reduce((n, l) => n + l.firstTryCorrect, 0),
      toReview: own.reduce((n, l) => n + pendingReview(l, lessons).length, 0),
      nextDeadline: deadlines.find((d) => d.courseId === c.id && !d.completedAt && d.daysLeft >= 0) ?? null,
    }
  })
}

// ---------- what to study today ----------

/** How much each kind of deadline raises the priority of its course. */
export const KIND_WEIGHT: Record<DeadlineKind, number> = {
  exam: 1,
  quiz: 0.7,
  project: 0.6,
  assignment: 0.5,
  other: 0.4,
}

/** How close a deadline is, from 1 (today or tomorrow) down to 0 (three weeks or more away, or past). */
export function proximity(daysLeft: number) {
  if (daysLeft < 0) return 0
  if (daysLeft <= 1) return 1
  if (daysLeft <= 3) return 0.85
  if (daysLeft <= 7) return 0.6
  if (daysLeft <= 14) return 0.3
  if (daysLeft <= 21) return 0.1
  return 0
}

/** The deadline that puts the most pressure on a course right now, and how much. */
export function coursePressure(courseId: number | null, deadlines: DatedDeadline[]) {
  let best: { boost: number; deadline: DatedDeadline | null } = { boost: 0, deadline: null }
  for (const d of deadlines) {
    if (d.courseId !== courseId || d.completedAt) continue
    const boost = KIND_WEIGHT[d.kind] * proximity(d.daysLeft)
    if (boost > best.boost) best = { boost, deadline: d }
  }
  return best
}

export function listConcepts(concepts: string[], max = 2) {
  const unique = [...new Set(concepts)]
  if (unique.length <= 1) return unique[0] ?? ''
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  if (unique.length <= max) return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`
  return `${unique.slice(0, max).join(', ')} and ${unique.length - max} more`
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Picks what to study today. Each candidate gets
 *   priority = type weight × (1 + 2 × deadline pressure) × recency,
 * and the plan takes the highest priorities, up to `maxActions` steps and about `minuteBudget` minutes.
 * Every step carries a plain-language reason built from the same signals.
 */
export function planToday(
  input: {
    today: string
    courses: AcademyCourse[]
    deadlines: DatedDeadline[]
    lessons: LessonProgress[]
    /** Candidates from the learning loop (next-step.ts), already weighted. */
    extra?: StudyAction[]
    /** Courses that have uploaded material, so they don't need an 'add material' step. */
    coursesWithMaterial?: Set<number>
    /** Where 'add material' goes. */
    uploadPath?: string
  },
  { maxActions = 3, minuteBudget = 45 }: { maxActions?: number; minuteBudget?: number } = {},
): StudyAction[] {
  const { today, courses, deadlines, lessons } = input
  const courseName = new Map(courses.map((c) => [c.id, c.name]))
  const candidates: StudyAction[] = [...(input.extra ?? [])]

  const deadlineReason = (pressure: ReturnType<typeof coursePressure>) =>
    pressure.deadline ? `${sentence(pressure.deadline.title)} is ${whenLabel(pressure.deadline.daysLeft)}.` : ''
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

  for (const l of lessons) {
    if (l.status === 'not-ready') continue
    const pressure = coursePressure(l.courseId, deadlines)
    const urgency = 1 + 2 * pressure.boost
    const common = {
      courseId: l.courseId,
      courseName: l.courseId === null ? null : (courseName.get(l.courseId) ?? null),
      lessonId: l.id,
    }

    if (l.status === 'in-progress') {
      const remaining = l.resumePart === null ? 1 : l.parts - l.resumePart + 1
      candidates.push({
        ...common,
        key: `continue-${l.id}`,
        kind: 'continue',
        title: `Continue ${l.title}`,
        why: join(`You stopped after part ${(l.resumePart ?? l.parts) - 1} of ${l.parts}.`, deadlineReason(pressure)),
        minutes: Math.max(3, remaining * 2),
        href: `/class/${l.id}${l.resumePart ? `?part=${l.resumePart}` : ''}`,
        priority: 0.8 * urgency,
      })
    } else if (l.status === 'new') {
      const isReview = l.kind === 'review'
      const fresh = daysBetween(l.createdAt, today) <= 3
      candidates.push({
        ...common,
        key: `${isReview ? 'open-review' : 'start'}-${l.id}`,
        kind: isReview ? 'open-review' : 'start',
        title: isReview ? l.title : `Start ${l.title}`,
        why: join(
          isReview
            ? 'Your review lesson is ready, built from what you missed.'
            : 'You haven’t started this lesson yet.',
          deadlineReason(pressure),
        ),
        minutes: Math.max(3, l.estimatedMinutes),
        href: `/class/${l.id}`,
        priority: (isReview ? 1.05 : 0.6) * urgency * (fresh ? 1.1 : 1),
      })
    } else {
      const missed = pendingReview(l, lessons)
      if (missed.length === 0) continue
      const recent = daysBetween(missed[0].at, today) <= 7
      const concepts = missed.map((m) => m.concept)
      candidates.push({
        ...common,
        key: `review-${l.id}`,
        kind: 'review',
        title: `Review ${listConcepts(concepts.map((c) => `“${c}”`))}`,
        why: join(
          `You missed ${concepts.length === 1 ? 'this' : 'these'} on the first try${recent ? ' this week' : ''}.`,
          deadlineReason(pressure),
        ),
        minutes: Math.min(4, concepts.length) * 3,
        href: null,
        priority: (0.9 + 0.1 * Math.min(concepts.length, 4)) * urgency * (recent ? 1.15 : 1),
      })
    }
  }

  // A deadline is coming and there is nothing in Lyceo for that course yet.
  for (const c of courses) {
    const pressure = coursePressure(c.id, deadlines)
    if (!pressure.deadline || pressure.deadline.daysLeft > 14) continue
    if (lessons.some((l) => l.courseId === c.id && l.status !== 'not-ready')) continue
    if (input.coursesWithMaterial?.has(c.id)) continue
    candidates.push({
      key: `add-material-${c.id}`,
      kind: 'add-material',
      title: `Add material for ${c.name}`,
      why: join(deadlineReason(pressure), 'There’s nothing to study for it in Lyceo yet.'),
      minutes: 5,
      courseId: c.id,
      courseName: c.name,
      lessonId: null,
      href: `${input.uploadPath ?? '/upload'}?course=${c.id}`,
      priority: 0.85 * (1 + 2 * pressure.boost),
    })
  }

  const ranked = candidates.sort((a, b) => b.priority - a.priority || a.minutes - b.minutes)
  const plan: StudyAction[] = []
  let minutes = 0
  for (const c of ranked) {
    if (plan.length >= maxActions) break
    if (plan.length > 0 && minutes + c.minutes > minuteBudget) continue
    plan.push(c)
    minutes += c.minutes
  }
  return plan
}
