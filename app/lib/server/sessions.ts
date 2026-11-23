import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isIsoDate } from './academy'
import { HttpError } from './auth'
import { localDay, validTimeZone } from '../mastery'
import { sessionProgress, type SessionItem } from '../study'
import { courseNamesOf, loadLearning, loadSession, sessionAnswers, summaryOf } from './learning-data'
import { itemForGrading } from './records'
import type { AnswerView, SessionView } from '../views'

/** The student's date and time zone, sent by the browser (query string or body). */
export function clientClock(source: URLSearchParams | Record<string, unknown>) {
  const get = (k: string) => (source instanceof URLSearchParams ? source.get(k) : source[k])
  const tz = validTimeZone(get('tz'))
  const today = get('today')
  return { tz, today: isIsoDate(today) ? today : localDay(new Date(), tz) }
}

export function sessionId(raw: string) {
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'That session does not exist or is not yours.')
  return id
}

/**
 * A session as the student sees it: its items in order, their answers, where they are, the hints already shown for
 * the current question, and the closure once it's over. Built from rows the student can read anyway, plus the hints
 * the server already revealed. No key is ever part of it.
 */
export async function sessionView(
  db: SupabaseClient,
  userId: string,
  id: number,
  clock: { tz: string | null; today: string },
): Promise<SessionView> {
  const session = await loadSession(db, id)
  const learning = await loadLearning(db, { courseId: session.academy_course_id, tz: clock.tz, today: clock.today })
  const answers = sessionAnswers(learning, id)
  const progress = sessionProgress(session.items, answers)
  const names = await courseNamesOf(db)

  let hints: string[] = []
  let hintsLeft = 0
  if (session.status === 'active' && progress.current) {
    const k = await itemForGrading(userId, id, progress.current)
    const all = k.key.hints ?? []
    hints = all.slice(0, k.hintsRevealed)
    hintsLeft = Math.max(0, all.length - k.hintsRevealed)
  }
  const skillNames: Record<number, string> = {}
  for (const item of session.items) skillNames[item.skill_id] = learning.skills.get(item.skill_id)?.name ?? 'This idea'
  const materialTitles: Record<number, string> = {}
  for (const m of learning.materials) materialTitles[m.id] = m.title

  return {
    session: {
      id: session.id,
      status: session.status,
      mode: session.mode,
      courseId: session.academy_course_id,
      courseName: session.academy_course_id === null ? null : (names.get(session.academy_course_id) ?? null),
      activeSeconds: session.active_seconds,
      startedAt: session.started_at,
    },
    steps: progress.items.map((v) => ({
      item: v.item as SessionItem,
      answers: v.answers.map((a): AnswerView => ({
        verdict: a.verdict,
        answer: a.answer,
        solution: a.solution,
        final: a.final,
        mode: a.mode,
      })),
    })),
    current: progress.current,
    pendingTeach: session.status === 'active' ? progress.pendingTeach : null,
    questions: progress.questions,
    answered: progress.answered,
    remaining: progress.remaining,
    hints,
    hintsLeft,
    skillNames,
    materialTitles,
    summary: session.status === 'completed' ? summaryOf(learning, session, names, true) : null,
  }
}
