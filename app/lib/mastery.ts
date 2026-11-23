// Mastery policy v1: what a student's answers say about each skill. Pure, so the server, the closure and the tests
// all read the same rules. Decisions are recomputed from the evidence every time; changing the policy changes no data.
//
//   Confirmed        2+ answers on the student's own, on 2+ different days, at least one of medium difficulty, and
//                    one application answer if the skill involves application. Only answers graded by a rule, or by
//                    two model gradings that agreed, count.
//   Needs practice   the last answer was wrong, or 2 of the last 3 were.
//   Review           confirmed, and 7, 14, then 28 days have passed since the last answer.
//   Learning         some evidence, not yet confirmed. Answers with help count as practice, never as proof.
//   New              no evidence yet.
//
// Unclear answers, and answers whose two gradings disagreed, count neither for nor against.

import { daysBetween } from './academy'

export const POLICY_VERSION = 'v1' as const
const REVIEW_INTERVALS = [7, 14, 28]

export type Facet = 'conceptual' | 'procedural' | 'application'
export type Verdict = 'correct' | 'partial' | 'incorrect' | 'unclear'

/** One answer from a study session, as session_events stores it. */
export type Evidence = {
  skillId: number
  sessionId: number
  itemId: string
  /** ISO timestamp. */
  at: string
  /** The student's local date, 'YYYY-MM-DD'. */
  day: string
  verdict: Verdict
  mode: 'independent' | 'assisted'
  difficulty: number
  facet: Facet
  grader: string | null
  doubleGraded: boolean | null
  needsReview: boolean
  hintsUsed: number
  explainedBefore: boolean
  teachingRound: number
  errorTag: string | null
}

export type SkillStateName = 'new' | 'learning' | 'needs_practice' | 'confirmed' | 'review'

export const STATE_LABEL: Record<SkillStateName, string> = {
  new: 'Not checked yet',
  learning: 'Learning',
  needs_practice: 'Needs practice',
  confirmed: 'Confirmed',
  review: 'Review recommended',
}

export type Help = 'none' | 'hint' | 'explanation'

export type SkillState = {
  skillId: number
  state: SkillStateName
  /** What the evidence shows, in a sentence. */
  reason: string
  /** What would move the skill forward, said as the next step. Null when nothing is missing. */
  next: string | null
  /** Independent, reliably graded correct answers. */
  proofs: number
  proofDays: string[]
  answers: number
  lastAnswerDay: string | null
  lastVerdict: Verdict | null
  lastHelp: Help | null
  wrongOfLast3: number
  confirmedOn: string | null
  reviewDueOn: string | null
  /** Answers left out because their grading was uncertain. */
  uncertain: number
  /** What confirming still needs: an answer without help, one on another day, a medium or an application one. */
  missing: 'independent' | 'another_day' | 'medium' | 'application' | null
  policyVersion: typeof POLICY_VERSION
}

/** 'Nov 21' from '2026-11-21'. */
export function shortDay(day: string) {
  return new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 'Nov 21', 'Nov 21 and Nov 22', 'Nov 20, Nov 21 and Nov 22'. */
export function listDays(days: string[]) {
  const labels = days.map(shortDay)
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export const count = (n: number) => NUMBER_WORDS[n] ?? String(n)
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function helpOf(e: Pick<Evidence, 'hintsUsed' | 'explainedBefore' | 'teachingRound'>): Help {
  if (e.explainedBefore || e.teachingRound > 0) return 'explanation'
  if (e.hintsUsed > 0) return 'hint'
  return 'none'
}

/** Graded by a rule, or by two model gradings that agreed. */
export function reliablyGraded(e: Pick<Evidence, 'grader' | 'doubleGraded' | 'needsReview'>) {
  if (e.needsReview) return false
  return e.grader === 'rule' || (e.grader === 'model' && e.doubleGraded === true)
}

export function isProof(e: Evidence) {
  return e.mode === 'independent' && e.verdict === 'correct' && reliablyGraded(e)
}

/** The day the conditions were first all met, walking the proofs in order; null if they never were. */
function confirmedOnDay(proofs: Evidence[], facets: Facet[]) {
  const needsApplication = facets.includes('application')
  const seen: Evidence[] = []
  for (const p of proofs) {
    seen.push(p)
    const days = new Set(seen.map((s) => s.day))
    if (
      seen.length >= 2 &&
      days.size >= 2 &&
      seen.some((s) => s.difficulty >= 2) &&
      (!needsApplication || seen.some((s) => s.facet === 'application'))
    )
      return p.day
  }
  return null
}

/**
 * The state of one skill. `evidence` holds every answer about the skill (and about skills merged into it), in any
 * order. `today` is the student's local date.
 */
export function skillState(skill: { id: number; facets: Facet[] }, evidence: Evidence[], today: string): SkillState {
  const sorted = [...evidence].sort((x, y) => x.at.localeCompare(y.at))
  const uncertain = sorted.filter((e) => e.verdict !== 'unclear' && e.needsReview).length
  const answers = sorted.filter((e) => e.verdict !== 'unclear' && !e.needsReview)
  const proofs = answers.filter(isProof)
  const proofDays = [...new Set(proofs.map((p) => p.day))]
  const last = answers[answers.length - 1] ?? null
  const last3 = answers.slice(-3)
  const wrong = last3.filter((e) => e.verdict === 'incorrect').length
  const confirmedOn = confirmedOnDay(proofs, skill.facets)

  const base = {
    skillId: skill.id,
    proofs: proofs.length,
    proofDays,
    answers: answers.length,
    lastAnswerDay: last?.day ?? null,
    lastVerdict: last?.verdict ?? null,
    lastHelp: last ? helpOf(last) : null,
    wrongOfLast3: wrong,
    confirmedOn,
    reviewDueOn: null as string | null,
    uncertain,
    missing: null as SkillState['missing'],
    policyVersion: POLICY_VERSION,
  }

  if (!last) {
    return {
      ...base,
      state: 'new',
      reason: uncertain ? 'Your answer’s grade was uncertain, so it doesn’t count yet.' : 'Not checked yet.',
      next: null,
    }
  }

  if (last.verdict === 'incorrect' || wrong >= 2) {
    const reason =
      wrong >= 2
        ? wrong === last3.length
          ? `You missed the last ${count(wrong)}.`
          : `You missed ${count(wrong)} of the last ${count(last3.length)}.`
        : 'You missed the last one.'
    return { ...base, state: 'needs_practice', reason, next: 'Practice it with a short explanation first.' }
  }

  if (confirmedOn) {
    const establishing = proofs.filter((p) => p.day <= confirmedOn)
    const medium = establishing.filter((p) => p.difficulty >= 2).length
    const days = [...new Set(establishing.map((p) => p.day))].slice(-3)
    const reviews = proofDays.filter((d) => d > confirmedOn).length
    const interval = REVIEW_INTERVALS[Math.min(reviews, REVIEW_INTERVALS.length - 1)]
    const dueOn = addDays(last.day, interval)
    const ago = daysBetween(last.day, today)
    if (today >= dueOn) {
      return {
        ...base,
        reviewDueOn: dueOn,
        state: 'review',
        reason: reviews ? `Your last review was ${ago} days ago.` : `You confirmed it ${ago} days ago.`,
        next: 'A quick question keeps it.',
      }
    }
    const mediumClause =
      medium === establishing.length
        ? establishing.length === 2
          ? 'both of medium difficulty or harder'
          : 'all of medium difficulty or harder'
        : `${count(medium)} of medium difficulty or harder`
    return {
      ...base,
      reviewDueOn: dueOn,
      state: 'confirmed',
      reason: `${capital(count(establishing.length))} answers on your own, ${mediumClause}, on ${listDays(days)}.`,
      next: null,
    }
  }

  // Learning: some evidence, not confirmed yet. Say what's there, then the next step.
  if (proofs.length === 0) {
    const helped = answers.filter((e) => e.verdict === 'correct' && e.mode === 'assisted')
    const unconfirmedGrade = answers.some((e) => e.verdict === 'correct' && e.mode === 'independent')
    let reason: string
    if (unconfirmedGrade) reason = 'You got it on your own, but that grade needs a second check to count.'
    else if (helped.length) {
      const how = helpOf(helped[helped.length - 1])
      reason = how === 'hint' ? 'Solved with a hint so far.' : 'Solved after an explanation so far.'
    } else if (answers.some((e) => e.verdict === 'partial')) reason = 'Partly right so far.'
    else reason = 'Practiced so far.'
    return {
      ...base,
      state: 'learning',
      reason,
      next: 'One answer without help starts to confirm it.',
      missing: 'independent',
    }
  }

  const reason =
    proofs.length === 1
      ? `One answer on your own so far (${shortDay(proofs[0].day)}).`
      : `${capital(count(proofs.length))} answers on your own so far (${listDays(proofDays.slice(-3))}).`
  if (proofDays.length < 2 || proofs.length < 2)
    return { ...base, state: 'learning', reason, next: 'One more on another day confirms it.', missing: 'another_day' }
  if (!proofs.some((p) => p.difficulty >= 2))
    return { ...base, state: 'learning', reason, next: 'One medium question confirms it.', missing: 'medium' }
  return { ...base, state: 'learning', reason, next: 'One application question confirms it.', missing: 'application' }
}

/** The student's local date for a timestamp, in an IANA time zone (falls back to UTC). */
export function localDay(at: string | Date, timeZone: string | null | undefined) {
  const date = typeof at === 'string' ? new Date(at) : at
  try {
    if (timeZone) return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date)
  } catch {
    // An unknown zone name: use UTC.
  }
  return date.toISOString().slice(0, 10)
}

export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== 'string' || tz.length > 64) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return null
  }
}
