import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeLesson, type LearnerSummary, type Pace, type Personalization } from '../lesson'
import { normalizeMajor } from '../learning-styles'

// Lyceo's learner model. Every check-in answer is stored in session_events;
// from those we estimate, per concept, whether the student got it on the first try
// and how often they needed help, plus their overall pace.
// computeLearner is pure so My Academy can reuse it on data it has already loaded.

export type ConceptStat = {
  concept: string
  courseId: number
  courseTitle: string
  segmentIndex: number
  attempts: number
  correct: number
  firstTryCorrect: boolean
  /** Laplace-smoothed share of correct answers: (correct + 1) / (attempts + 2). */
  mastery: number
  lastSeen: string
}

export type LearnerModel = {
  answers: number
  conceptsSeen: number
  firstTryAccuracy: number | null
  recentFirstTryAccuracy: number | null
  avgSecondsToAnswer: number | null
  pace: Pace
  styleId: string | null
  major: string | null
  needsReview: ConceptStat[]
  mastered: ConceptStat[]
}

export type EventRow = {
  course_id: number
  segment_index: number
  correct: boolean
  time_to_answer_seconds: number | null
  created_at: string
}

export type LessonRow = { id: number; title: string | null; script: unknown }
export type ProfileRow = { career: string | null; learning_style: string | null } | null

export function paceFrom(firstTryAccuracy: number | null, conceptsSeen: number): Pace {
  if (firstTryAccuracy === null || conceptsSeen < 3) return 'steady'
  if (firstTryAccuracy < 0.55) return 'gentle'
  if (firstTryAccuracy > 0.85 && conceptsSeen >= 5) return 'brisk'
  return 'steady'
}

/** Groups check-in attempts by lesson and part, oldest first. */
export function groupAttempts(events: EventRow[]) {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const groups = new Map<string, EventRow[]>()
  for (const e of sorted) {
    const key = `${e.course_id}:${e.segment_index}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  return groups
}

export function computeLearner(profile: ProfileRow, events: EventRow[], lessons: LessonRow[]): LearnerModel {
  const conceptName = new Map<string, { concept: string; title: string }>()
  for (const c of lessons) {
    const lesson = normalizeLesson(c.script)
    lesson?.segments.forEach((s, i) =>
      conceptName.set(`${c.id}:${i}`, { concept: s.concept || `Part ${i + 1}`, title: lesson.title || c.title || '' }),
    )
  }

  const stats: ConceptStat[] = []
  for (const [key, attempts] of groupAttempts(events)) {
    const name = conceptName.get(key)
    if (!name) continue
    const correct = attempts.filter((a) => a.correct).length
    stats.push({
      concept: name.concept,
      courseId: attempts[0].course_id,
      courseTitle: name.title,
      segmentIndex: attempts[0].segment_index,
      attempts: attempts.length,
      correct,
      firstTryCorrect: attempts[0].correct,
      mastery: (correct + 1) / (attempts.length + 2),
      lastSeen: attempts[attempts.length - 1].created_at,
    })
  }

  const byRecent = [...stats].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
  const share = (list: ConceptStat[]) =>
    list.length ? list.filter((s) => s.firstTryCorrect).length / list.length : null
  const times = events.map((r) => r.time_to_answer_seconds).filter((t): t is number => typeof t === 'number' && t > 0)

  return {
    answers: events.length,
    conceptsSeen: stats.length,
    firstTryAccuracy: share(stats),
    recentFirstTryAccuracy: share(byRecent.slice(0, 15)),
    avgSecondsToAnswer: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    pace: paceFrom(share(byRecent.slice(0, 20)), stats.length),
    styleId: profile?.learning_style ?? null,
    major: normalizeMajor(profile?.career),
    needsReview: byRecent.filter((s) => !s.firstTryCorrect),
    mastered: byRecent.filter((s) => s.firstTryCorrect),
  }
}

export async function loadLearner(db: SupabaseClient, userId: string): Promise<LearnerModel> {
  const [{ data: profile }, { data: events }] = await Promise.all([
    db.from('users').select('career, learning_style').eq('id', userId).maybeSingle(),
    db
      .from('session_events')
      .select('course_id, segment_index, correct, time_to_answer_seconds, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(2000),
  ])

  const rows = (events ?? []) as EventRow[]
  const lessonIds = [...new Set(rows.map((e) => e.course_id))]
  const { data: lessons } = lessonIds.length
    ? await db.from('courses').select('id, title, script').in('id', lessonIds)
    : { data: [] }

  return computeLearner(profile as ProfileRow, rows, (lessons ?? []) as LessonRow[])
}

export function personalizationFor(learner: LearnerModel): Personalization {
  return {
    styleId: learner.styleId,
    major: learner.major,
    pace: learner.pace,
    focusConcepts: learner.needsReview.slice(0, 8).map((s) => s.concept),
  }
}

export function summarizeLearner(l: LearnerModel): LearnerSummary {
  return {
    answers: l.answers,
    conceptsSeen: l.conceptsSeen,
    firstTryAccuracy: l.firstTryAccuracy,
    recentFirstTryAccuracy: l.recentFirstTryAccuracy,
    avgSecondsToAnswer: l.avgSecondsToAnswer,
    pace: l.pace,
    styleId: l.styleId,
    major: l.major,
    mastered: l.mastered.length,
    needsReview: l.needsReview
      .slice(0, 6)
      .map(({ concept, courseId, courseTitle }) => ({ concept, courseId, courseTitle })),
  }
}
