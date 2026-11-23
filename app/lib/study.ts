// A study session as the student moves through it, and the closure at the end. Pure: the server and the tests use
// the same functions.

import { listConcepts } from './academy'
import { count, helpOf, STATE_LABEL, type Evidence, type Facet, type SkillState, type SkillStateName } from './mastery'

/** An item as public.study_sessions.items stores it: the question or explanation, never its key. */
export type SessionItem = {
  id: string
  type: 'question' | 'explanation'
  skill_id: number
  difficulty: number
  facet: Facet
  prompt: string
  format?: 'number' | 'expression' | 'choice' | 'short_text'
  choices?: string[]
  board?: string[]
  sources?: { materialId?: number; lessonId?: number; pages?: number[]; quote?: string }[]
  /** Teaching items: the question they follow up. */
  follows?: string
  round?: 1 | 2
}

/** One recorded answer in the session. `final` is false only for an unclear first answer, which can be clarified. */
export type SessionAnswer = Evidence & {
  eventId: number
  answer: string
  solution: string | null
  final: boolean
}

/** Teaching rounds per skill in one session. */
export const MAX_ROUNDS = 2
export const MIN_QUESTIONS = 4
export const MAX_QUESTIONS = 6

/** Items in the order the student meets them: each question followed by its explanation and practice problem. */
export function orderItems(items: SessionItem[]): SessionItem[] {
  const ids = new Set(items.map((i) => i.id))
  const children = new Map<string, SessionItem[]>()
  const roots: SessionItem[] = []
  for (const item of items) {
    if (item.follows && ids.has(item.follows) && item.follows !== item.id) {
      const list = children.get(item.follows) ?? []
      list.push(item)
      children.set(item.follows, list)
    } else roots.push(item)
  }
  const out: SessionItem[] = []
  const seen = new Set<string>()
  const visit = (item: SessionItem) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    out.push(item)
    for (const child of children.get(item.id) ?? []) visit(child)
  }
  roots.forEach(visit)
  return out
}

export function roundsUsed(items: SessionItem[], skillId: number) {
  return items.filter((i) => i.type === 'explanation' && i.skill_id === skillId).length
}

export type ItemProgress = {
  item: SessionItem
  answers: SessionAnswer[]
  /** The answer that ended the question: anything but an unclear first answer. */
  final: SessionAnswer | null
}

export type Progress = {
  items: ItemProgress[]
  /** The first question without a final answer. */
  current: string | null
  /**
   * A question answered wrong or partly right whose explanation and new problem haven't been written yet, and which
   * comes before `current`. The browser asks for them; if that fails, the student can go on to `current`.
   */
  pendingTeach: string | null
  questions: number
  answered: number
  remaining: number
}

export function sessionProgress(items: SessionItem[], answers: SessionAnswer[]): Progress {
  const ordered = orderItems(items)
  const byItem = new Map<string, SessionAnswer[]>()
  for (const a of [...answers].sort((x, y) => x.eventId - y.eventId)) {
    const list = byItem.get(a.itemId) ?? []
    list.push(a)
    byItem.set(a.itemId, list)
  }
  const followed = new Set(items.map((i) => i.follows).filter(Boolean) as string[])
  const view = ordered.map((item) => {
    const list = byItem.get(item.id) ?? []
    return { item, answers: list, final: list.find((a) => a.final) ?? null }
  })

  let current: string | null = null
  let pendingTeach: string | null = null
  for (const v of view) {
    if (v.item.type !== 'question') continue
    if (!v.final) {
      current = v.item.id
      break
    }
    const missed = v.final.verdict === 'incorrect' || v.final.verdict === 'partial'
    if (!pendingTeach && missed && !followed.has(v.item.id) && roundsUsed(items, v.item.skill_id) < MAX_ROUNDS)
      pendingTeach = v.item.id
  }
  const questions = view.filter((v) => v.item.type === 'question')
  const answered = questions.filter((v) => v.final).length
  return {
    items: view,
    current,
    pendingTeach,
    questions: questions.length,
    answered,
    remaining: questions.length - answered,
  }
}

// ---------- choosing the questions ----------

export type PlannedQuestion = { skillId: number; difficulty: 1 | 2 | 3; facet: Facet }

const FACETS: Facet[] = ['conceptual', 'procedural', 'application']

function firstSlot(skill: { facets: Facet[]; state: SkillState }): PlannedQuestion & { skillId: number } {
  const facets = skill.facets.length ? skill.facets : (['conceptual'] as Facet[])
  const s = skill.state
  switch (s.state) {
    case 'new':
      return { skillId: s.skillId, difficulty: 1, facet: facets[0] }
    case 'needs_practice':
      return { skillId: s.skillId, difficulty: 1, facet: facets.includes('procedural') ? 'procedural' : facets[0] }
    case 'learning':
      return {
        skillId: s.skillId,
        difficulty: 2,
        facet:
          s.missing === 'application' && facets.includes('application')
            ? 'application'
            : facets.includes('procedural')
              ? 'procedural'
              : facets[0],
      }
    default:
      return { skillId: s.skillId, difficulty: 2, facet: facets.includes('application') ? 'application' : facets[0] }
  }
}

/**
 * One question per skill, in the order given (most urgent first), between MIN and MAX questions. With fewer skills
 * than MIN, skills get a second question, harder and from another angle where the skill has one.
 */
export function planQuestions(
  skills: { facets: Facet[]; state: SkillState }[],
  { min = MIN_QUESTIONS, max = MAX_QUESTIONS } = {},
): PlannedQuestion[] {
  const plan = skills.slice(0, max).map(firstSlot)
  let i = 0
  while (plan.length < min && skills.length > 0 && i < skills.length * 3) {
    const skill = skills[i % skills.length]
    const earlier = plan.filter((p) => p.skillId === skill.state.skillId)
    const last = earlier[earlier.length - 1]
    const facets = skill.facets.length ? skill.facets : FACETS
    const unused = facets.find((f) => !earlier.some((e) => e.facet === f))
    plan.push({
      skillId: skill.state.skillId,
      difficulty: Math.min(3, (last?.difficulty ?? 1) + 1) as 1 | 2 | 3,
      facet: unused ?? last?.facet ?? facets[0],
    })
    i++
  }
  return plan
}

// ---------- closure ----------

export type SessionSummary = {
  version: 1
  courseName: string | null
  minutes: number
  /** Questions with a final answer, practice problems included. */
  questions: number
  onYourOwn: string[]
  withHelp: { skill: string; how: string }[]
  /** Mistakes the student made and then fixed in this session. */
  corrected: string[]
  partly: string[]
  /** Skills whose last answer was still wrong, with the mistake when the grader named one. */
  toPractice: { skill: string; mistake: string | null }[]
  /** Answers whose grading was uncertain: they count neither way. */
  uncertain: number
  overTime: {
    skillId: number
    skill: string
    state: SkillStateName
    label: string
    reason: string
    next: string | null
  }[]
  tomorrow: { title: string; minutes: number } | null
  /** Questions not answered yet (a session stopped early). */
  remaining: number
  finished: boolean
}

export function buildSummary(input: {
  courseName: string | null
  activeSeconds: number
  items: SessionItem[]
  answers: SessionAnswer[]
  skillNames: Map<number, string>
  /** Each skill's state after this session. */
  states: Map<number, SkillState>
  tomorrow: { title: string; minutes: number } | null
  finished: boolean
}): SessionSummary {
  const progress = sessionProgress(input.items, input.answers)
  const name = (id: number) => input.skillNames.get(id) ?? 'this idea'
  const finals = progress.items.map((v) => v.final).filter((a): a is SessionAnswer => a !== null)
  const counted = finals.filter((a) => a.verdict !== 'unclear' && !a.needsReview)
  const touched = [...new Set(finals.map((a) => a.skillId))]

  const onYourOwn = touched.filter((s) =>
    counted.some((a) => a.skillId === s && a.verdict === 'correct' && a.mode === 'independent'),
  )
  const withHelp: SessionSummary['withHelp'] = []
  for (const s of touched) {
    if (onYourOwn.includes(s)) continue
    const helped = counted.find((a) => a.skillId === s && a.verdict === 'correct' && a.mode === 'assisted')
    if (!helped) continue
    const how =
      helpOf(helped) === 'hint'
        ? 'with a hint'
        : helped.teachingRound >= 2
          ? 'solved after a second explanation'
          : 'solved on the second try after the explanation'
    withHelp.push({ skill: name(s), how })
  }

  // A mistake the grader named, followed later in the session by a right answer on the same skill.
  const corrected: string[] = []
  for (const a of counted) {
    if (a.verdict === 'correct' || !a.errorTag) continue
    const fixed = counted.some((b) => b.skillId === a.skillId && b.eventId > a.eventId && b.verdict === 'correct')
    if (fixed && !corrected.includes(a.errorTag)) corrected.push(a.errorTag)
  }

  const lastBySkill = new Map<number, SessionAnswer>()
  for (const a of counted) lastBySkill.set(a.skillId, a)
  const partly: string[] = []
  const toPractice: SessionSummary['toPractice'] = []
  for (const [s, last] of lastBySkill) {
    if (last.verdict === 'partial' && !onYourOwn.includes(s) && !withHelp.some((w) => w.skill === name(s)))
      partly.push(name(s))
    if (last.verdict === 'incorrect') toPractice.push({ skill: name(s), mistake: last.errorTag })
  }

  const overTime = touched
    .map((s) => input.states.get(s))
    .filter((st): st is SkillState => !!st)
    .map((st) => ({
      skillId: st.skillId,
      skill: name(st.skillId),
      state: st.state,
      label: STATE_LABEL[st.state],
      reason: st.reason,
      next: st.next,
    }))

  return {
    version: 1,
    courseName: input.courseName,
    minutes: Math.max(1, Math.round(input.activeSeconds / 60)),
    questions: finals.length,
    onYourOwn: onYourOwn.map(name),
    withHelp,
    corrected,
    partly,
    toPractice,
    uncertain: finals.filter((a) => a.needsReview).length,
    overTime,
    tomorrow: input.tomorrow,
    remaining: progress.remaining,
    finished: input.finished,
  }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const plural = (n: number, one: string, many = `${one}s`) => `${n === 1 ? 'one' : count(n)} ${n === 1 ? one : many}`

/**
 * The closure as sentences, each category on its own line. An empty category is left out: there is never a line
 * that says nothing happened.
 */
export function summaryLines(s: SessionSummary) {
  const today: string[] = []
  if (s.questions > 0) today.push(`You worked ${plural(s.minutes, 'minute')} on ${plural(s.questions, 'question')}.`)
  else today.push(`You opened a Quick Check${s.courseName ? ` for ${s.courseName}` : ''}. Your questions are saved.`)
  if (s.onYourOwn.length) today.push(`On your own: ${listConcepts(s.onYourOwn, 4)}.`)
  for (const w of s.withHelp) today.push(`Learned with help: ${w.skill}, ${w.how}.`)
  if (s.corrected.length) today.push(`Corrected: ${listConcepts(s.corrected.map(lowerFirst), 3)}.`)
  if (s.partly.length) today.push(`Partly there: ${listConcepts(s.partly, 3)}.`)
  for (const p of s.toPractice)
    today.push(`Still to practice: ${p.skill}${p.mistake ? ` (${lowerFirst(p.mistake)})` : ''}.`)
  if (s.uncertain)
    today.push(
      s.uncertain === 1
        ? 'One grade was uncertain, so that answer counts neither way.'
        : `${capitalize(count(s.uncertain))} grades were uncertain, so those answers count neither way.`,
    )
  if (!s.finished && s.remaining > 0)
    today.push(`${capitalize(plural(s.remaining, 'question'))} left. Pick up where you stopped within two days.`)

  const overTime = s.overTime.map((o) => ({
    skill: o.skill,
    label: o.label,
    text: o.next ? `${o.reason} ${o.next}` : o.reason,
  }))
  const tomorrow = s.tomorrow ? `${s.tomorrow.title}, about ${s.tomorrow.minutes} minutes.` : null
  return { today, overTime, tomorrow }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
