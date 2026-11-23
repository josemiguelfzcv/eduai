// Turning a question the model wrote into a session item with its key, or rejecting it. Pure and tested: a question
// whose key the rules can't use, or whose hints give the answer away, never reaches a student.

import { readNumber } from './grading/equivalence'
import { normalizeText } from './skill-map'
import { plainText } from './text'
import type { PlannedQuestion } from './study'
import type { ItemKey, NewItem } from './server/records'

export type GeneratedQuestion = {
  format: 'choice' | 'number' | 'short_text'
  prompt: string
  /** Choice questions only. */
  choices: string[]
  /** The letter of the right choice, the number, or a model answer in a sentence or two. */
  answer: string
  /** Numbers only: how far from the answer still counts, in the answer's units. */
  tolerance: number | null
  /** Short answers only: what a complete answer shows. */
  rubric: { point: string; required: boolean }[]
  /** Common wrong answers and the mistake behind each. */
  mistakes: { answer: string; why: string }[]
  hints: string[]
  solution: string
  /** The page of the student's material the question practices. */
  page: number | null
}

export { plainText }

const LETTERS = 'ABCDE'

const clip = (s: unknown, max: number) =>
  plainText(String(s ?? ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

const tokens = (s: string) =>
  normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)

/**
 * A practice problem too close to a text the student just read: they share a run of six words, so matching words
 * would answer it instead of using the idea.
 */
export function tooClose(problem: string, read: string, run = 6) {
  const a = tokens(problem)
  const b = tokens(read)
  if (a.length < run || b.length < run) return false
  const runs = new Set<string>()
  for (let i = 0; i + run <= b.length; i++) runs.add(b.slice(i, i + run).join(' '))
  for (let i = 0; i + run <= a.length; i++) if (runs.has(a.slice(i, i + run).join(' '))) return true
  return false
}
const stripLabel = (s: string) => s.replace(/^\(?[A-Ea-e][.):]\s+/, '').trim()

/** The key and the public question, or null when the question can't be graded reliably. */
export function toItem(
  id: string,
  slot: PlannedQuestion,
  g: GeneratedQuestion,
  extra: { follows?: string; round?: 1 | 2 } = {},
): NewItem | null {
  const prompt = plainText(String(g.prompt ?? ''))
    .trim()
    .slice(0, 1500)
  const solution = plainText(String(g.solution ?? ''))
    .trim()
    .slice(0, 2000)
  if (prompt.length < 10 || !solution) return null
  const base = {
    id,
    type: 'question' as const,
    skillId: slot.skillId,
    difficulty: slot.difficulty,
    facet: slot.facet,
    prompt,
    ...extra,
  }
  let key: ItemKey
  let leaks: string[]

  if (g.format === 'choice') {
    const choices = (g.choices ?? []).map((c) => stripLabel(clip(c, 300))).filter(Boolean)
    const distinct = new Set(choices.map(normalizeText))
    if (choices.length < 3 || choices.length > 5 || distinct.size !== choices.length) return null
    const raw = clip(g.answer, 300)
    const letter = /^\(?([A-Ea-e])\)?[.)]?$/.exec(raw)?.[1]?.toUpperCase()
    const index = letter
      ? LETTERS.indexOf(letter)
      : choices.findIndex((c) => normalizeText(c) === normalizeText(stripLabel(raw)))
    if (index < 0 || index >= choices.length) return null
    key = { accepted: [LETTERS[index]], solution }
    leaks = [choices[index]]
    return finish({ ...base, format: 'choice', choices }, key, g, leaks)
  }

  if (g.format === 'number') {
    const answer = clip(g.answer, 60)
    const value = readNumber(answer)?.value
    if (value === undefined || value === null || !Number.isFinite(value)) return null
    key = { accepted: [answer], solution }
    const tol = Number(g.tolerance)
    if (Number.isFinite(tol) && tol > 0 && tol <= Math.max(Math.abs(value) * 0.05, 0.005)) key.tolerance = { abs: tol }
    const misconceptions = (g.mistakes ?? [])
      .map((m) => ({ answer: clip(m.answer, 60), tag: clip(m.why, 80) }))
      .filter((m) => m.tag && readNumber(m.answer) && readNumber(m.answer)!.value !== value)
      .slice(0, 4)
    if (misconceptions.length) key.misconceptions = misconceptions.map((m) => ({ ...m, verdict: 'incorrect' as const }))
    leaks = [answer]
    return finish({ ...base, format: 'number' }, key, g, leaks)
  }

  if (g.format === 'short_text') {
    const answer = clip(g.answer, 600)
    const rubric = (g.rubric ?? [])
      .map((r) => ({ point: clip(r.point, 200), required: r.required !== false }))
      .filter((r) => r.point)
      .slice(0, 4)
    if (!answer || !rubric.some((r) => r.required)) return null
    key = { accepted: [answer], rubric, solution }
    return finish({ ...base, format: 'short_text' }, key, g, [])
  }
  return null
}

/** Adds the hints that don't give the answer away. */
function finish(item: NewItem, key: ItemKey, g: GeneratedQuestion, answers: string[]): NewItem {
  // The answer as a whole token: "0.25" gives 0.25 away, but "2" inside "P(A) = 0.2" doesn't.
  const giveaway = answers
    .map(normalizeText)
    .filter((a) => a.length > 0)
    .map((a) => new RegExp(`(^|[^\\w.])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w])`))
  const hints = (g.hints ?? [])
    .map((h) => clip(h, 300))
    .filter((h) => h.length > 3)
    .filter((h) => !giveaway.some((re) => re.test(normalizeText(h))) && !/\bthe answer is\b/i.test(h))
    .slice(0, 2)
  if (hints.length) key.hints = hints
  return { ...item, key }
}
