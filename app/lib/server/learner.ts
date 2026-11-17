import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeLesson, type Pace, type Personalization } from '../lesson'
import { normalizeMajor } from '../learning-styles'

// Lyceo's learner model. Every check-in answer is stored in session_events;
// from those we estimate, per concept, whether the student got it on the first try
// and how often they needed help, plus their overall pace.

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

type EventRow = {
  course_id: number
  segment_index: number
  correct: boolean
  time_to_answer_seconds: number | null
  created_at: string
}

export function paceFrom(firstTryAccuracy: number | null, conceptsSeen: number): Pace {
  if (firstTryAccuracy === null || conceptsSeen < 3) return 'steady'
  if (firstTryAccuracy < 0.55) return 'gentle'
  if (firstTryAccuracy > 0.85 && conceptsSeen >= 5) return 'brisk'
  return 'steady'
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
  const courseIds = [...new Set(rows.map((e) => e.course_id))]
  const { data: courses } = courseIds.length
    ? await db.from('courses').select('id, title, script').in('id', courseIds)
    : { data: [] }

  const conceptName = new Map<string, { concept: string; title: string }>()
  for (const c of courses ?? []) {
    const lesson = normalizeLesson(c.script)
    lesson?.segments.forEach((s, i) =>
      conceptName.set(`${c.id}:${i}`, { concept: s.concept || `Part ${i + 1}`, title: lesson.title || c.title }),
    )
  }

  // Group attempts by (course, segment) in time order.
  const groups = new Map<string, EventRow[]>()
  for (const e of rows) {
    const key = `${e.course_id}:${e.segment_index}`
    if (!conceptName.has(key)) continue
    groups.set(key, [...(groups.get(key) ?? []), e])
  }

  const stats: ConceptStat[] = [...groups.entries()].map(([key, attempts]) => {
    const correct = attempts.filter((a) => a.correct).length
    const name = conceptName.get(key)!
    return {
      concept: name.concept,
      courseId: attempts[0].course_id,
      courseTitle: name.title,
      segmentIndex: attempts[0].segment_index,
      attempts: attempts.length,
      correct,
      firstTryCorrect: attempts[0].correct,
      mastery: (correct + 1) / (attempts.length + 2),
      lastSeen: attempts[attempts.length - 1].created_at,
    }
  })

  const byRecent = [...stats].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
  const share = (list: ConceptStat[]) =>
    list.length ? list.filter((s) => s.firstTryCorrect).length / list.length : null

  const times = rows.map((r) => r.time_to_answer_seconds).filter((t): t is number => typeof t === 'number' && t > 0)
  const firstTryAccuracy = share(stats)

  return {
    answers: rows.length,
    conceptsSeen: stats.length,
    firstTryAccuracy,
    recentFirstTryAccuracy: share(byRecent.slice(0, 15)),
    avgSecondsToAnswer: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    pace: paceFrom(share(byRecent.slice(0, 20)), stats.length),
    styleId: profile?.learning_style ?? null,
    major: normalizeMajor(profile?.career),
    needsReview: byRecent.filter((s) => !s.firstTryCorrect),
    mastered: byRecent.filter((s) => s.firstTryCorrect),
  }
}

export function personalizationFor(learner: LearnerModel): Personalization {
  return {
    styleId: learner.styleId,
    major: learner.major,
    pace: learner.pace,
    focusConcepts: learner.needsReview.slice(0, 8).map((s) => s.concept),
  }
}
