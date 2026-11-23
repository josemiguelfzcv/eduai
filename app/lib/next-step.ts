// What to do next, from the learning loop's evidence. Each rule gives a step with its reason in the student's terms;
// planToday (academy.ts) ranks them with the lesson steps and deadline pressure.
//
//   Resume        a Quick Check paused less than 48 hours ago
//   Confirm       a skill with some evidence whose last answer was yesterday or earlier
//   Practice      a skill that needs practice
//   First check   a new material with skills nobody has checked yet
//   Review        a confirmed skill whose review interval passed

import { coursePressure, daysBetween, listConcepts, type DatedDeadline, type StudyAction } from './academy'
import { shortDay, type Facet, type SkillState } from './mastery'
import { MIN_QUESTIONS } from './study'

export type SkillInfo = { id: number; name: string; courseId: number; facets: Facet[]; state: SkillState }
export type MaterialInfo = {
  id: number
  title: string
  courseId: number | null
  status: string
  createdAt: string
  skillIds: number[]
}
export type SessionInfo = {
  id: number
  courseId: number | null
  status: 'active' | 'completed' | 'stopped'
  lastActiveAt: string
  remaining: number
}

/** Weights before deadline pressure. Lesson steps run from 0.6 to about 1.3. */
const WEIGHT = { resume: 1.5, confirm: 1.3, practice: 1.25, 'first-check': 1.1, 'review-skills': 0.95 }
const RESUME_HOURS = 48
const quoted = (names: string[]) => listConcepts(names.map((n) => `“${n}”`))
const sessionMinutes = (skills: number) => 2 * Math.max(MIN_QUESTIONS, Math.min(skills, 6))

function when(day: string, today: string) {
  const ago = daysBetween(day, today)
  return ago === 1 ? 'Yesterday' : `On ${shortDay(day)}`
}

export function skillActions(input: {
  today: string
  now: Date
  courseNames: Map<number, string>
  deadlines: DatedDeadline[]
  skills: SkillInfo[]
  materials: MaterialInfo[]
  sessions: SessionInfo[]
}): StudyAction[] {
  const { today, courseNames, deadlines, skills } = input
  const out: StudyAction[] = []
  const urgency = (courseId: number | null) => 1 + 2 * coursePressure(courseId, deadlines).boost
  const course = (courseId: number | null) => (courseId === null ? null : (courseNames.get(courseId) ?? null))

  for (const s of input.sessions) {
    if (s.status !== 'active' || s.remaining <= 0) continue
    const hours = (input.now.getTime() - new Date(s.lastActiveAt).getTime()) / 3_600_000
    if (hours > RESUME_HOURS) continue
    const name = course(s.courseId)
    out.push({
      key: `resume-${s.id}`,
      kind: 'resume',
      title: 'Finish your Quick Check',
      why: `You stopped halfway through a Quick Check${name ? ` for ${name}` : ''}.`,
      minutes: Math.max(2, s.remaining * 2),
      courseId: s.courseId,
      courseName: name,
      lessonId: null,
      href: `/sessions/${s.id}`,
      priority: WEIGHT.resume * urgency(s.courseId),
    })
  }

  const byCourse = new Map<number, SkillInfo[]>()
  for (const s of skills) byCourse.set(s.courseId, [...(byCourse.get(s.courseId) ?? []), s])

  for (const [courseId, list] of byCourse) {
    const name = course(courseId)
    const common = { courseId, courseName: name, lessonId: null, href: null }

    const confirm = list
      .filter((s) => s.state.state === 'learning' && s.state.lastAnswerDay && s.state.lastAnswerDay < today)
      .sort((a, b) => (b.state.lastAnswerDay ?? '').localeCompare(a.state.lastAnswerDay ?? ''))
    if (confirm.length) {
      const first = confirm[0].state
      const day = when(first.lastAnswerDay!, today)
      let why: string
      if (confirm.length > 1) why = `${day} you practiced these. Today, without help.`
      else if (first.lastHelp === 'hint') why = `${day} you solved it with a hint. Today, without help.`
      else if (first.lastHelp === 'explanation') why = `${day} you solved it after an explanation. Today, without help.`
      else if (first.proofs > 0) why = `${day} you got it on your own. ${first.next ?? ''}`.trim()
      else if (first.lastVerdict === 'partial') why = `${day} you got part of it. Today, all of it on your own.`
      else why = `${day} you practiced it. Today, without help.`
      out.push({
        ...common,
        key: `confirm-${courseId}`,
        kind: 'confirm',
        title: `Confirm ${quoted(confirm.map((s) => s.name))} without help`,
        why,
        minutes: sessionMinutes(confirm.length),
        session: { courseId, skillIds: confirm.slice(0, 6).map((s) => s.id) },
        priority: WEIGHT.confirm * urgency(courseId),
      })
    }

    const practice = list.filter((s) => s.state.state === 'needs_practice')
    if (practice.length) {
      out.push({
        ...common,
        key: `practice-${courseId}`,
        kind: 'practice',
        title: `Practice ${quoted(practice.map((s) => s.name))}`,
        why: practice.length === 1 ? practice[0].state.reason : 'You missed these recently.',
        minutes: sessionMinutes(practice.length),
        session: { courseId, skillIds: practice.slice(0, 6).map((s) => s.id) },
        priority: WEIGHT.practice * urgency(courseId),
      })
    }

    const review = list.filter((s) => s.state.state === 'review')
    if (review.length) {
      out.push({
        ...common,
        key: `review-skills-${courseId}`,
        kind: 'review-skills',
        title: `Review ${quoted(review.map((s) => s.name))}`,
        why: review.length === 1 ? review[0].state.reason : 'It’s been a while since you confirmed these.',
        minutes: sessionMinutes(review.length),
        session: { courseId, skillIds: review.slice(0, 6).map((s) => s.id) },
        priority: WEIGHT['review-skills'] * urgency(courseId),
      })
    }
  }

  const skillById = new Map(skills.map((s) => [s.id, s]))
  for (const m of input.materials) {
    if (m.status !== 'mapped' || m.courseId === null) continue
    const unchecked = m.skillIds.map((id) => skillById.get(id)).filter((s) => s && s.state.state === 'new')
    if (!unchecked.length) continue
    const fresh = daysBetween(m.createdAt, today) <= 3
    out.push({
      key: `first-check-${m.id}`,
      kind: 'first-check',
      title: `Check what you know from ${m.title}`,
      why: `You added ${m.title} and haven’t practiced it yet.`,
      minutes: sessionMinutes(unchecked.length),
      courseId: m.courseId,
      courseName: course(m.courseId),
      lessonId: null,
      href: null,
      session: { courseId: m.courseId, skillIds: unchecked.slice(0, 6).map((s) => s!.id) },
      priority: WEIGHT['first-check'] * urgency(m.courseId) * (fresh ? 1.05 : 1),
    })
  }
  return out
}
