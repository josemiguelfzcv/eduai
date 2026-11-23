import 'server-only'
import { HttpError } from './auth'
import { pgCode, trustedDb, trustedDbConfigured } from './trusted-db'

// The server's writes that students must not be able to make themselves: a material's accepted file, study-session
// questions with their keys, graded answers, and account cleanup. Each call goes to a function in schema private
// (supabase/migrations/0003_trusted_server.sql) that checks the student owns what it touches.

/** True where the server's own database connection is configured (staging today). */
export function serverRecordsEnabled() {
  return trustedDbConfigured()
}

function db() {
  const sql = trustedDb()
  if (!sql) throw new HttpError(404, 'This part of Lyceo is not available yet.')
  return sql
}

/** Maps the functions' ownership errors to a 404, so nobody learns whether another student's row exists. */
async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (pgCode(err) === '42501') throw new HttpError(404, 'That does not exist or is not yours.')
    if (pgCode(err) === '55000') throw new HttpError(409, 'That session has already ended.')
    if (pgCode(err) === '23505') throw new HttpError(409, 'That question was already answered.')
    throw err
  }
}

// Materials ---------------------------------------------------------------------------------------------------

export async function acceptUpload(userId: string, materialId: number, bytes: number): Promise<string> {
  return call(async () => {
    const [row] =
      await db()`select private.material_accept_upload(${userId}::uuid, ${materialId}::bigint, ${bytes}::integer) as key`
    return row.key as string
  })
}

export async function rejectUpload(userId: string, materialId: number, reason: string) {
  await call(() => db()`select private.material_reject_upload(${userId}::uuid, ${materialId}::bigint, ${reason})`)
}

export async function forgetMaterial(userId: string, materialId: number) {
  await call(() => db()`select private.material_forget(${userId}::uuid, ${materialId}::bigint)`)
}

/** Where each page starts in the material's text. */
export type PageStart = { n: number; start: number }

/** Saves the text read from an accepted file, one entry per page in `pages`. Status becomes 'extracted'. */
export async function saveMaterialText(userId: string, materialId: number, text: string, pages: PageStart[]) {
  await call(async () => {
    const sql = db()
    await sql`select private.material_save_text(${userId}::uuid, ${materialId}::bigint, ${text}, ${sql.json(pages as never)})`
  })
}

/** The skill map of the material was written. Status becomes 'mapped'. */
export async function markMaterialMapped(userId: string, materialId: number) {
  await call(() => db()`select private.material_mark_mapped(${userId}::uuid, ${materialId}::bigint)`)
}

// Study sessions ----------------------------------------------------------------------------------------------

export type ItemFormat = 'number' | 'expression' | 'choice' | 'short_text'

/** A question as the student sees it. No field of this type ever holds an answer. */
export type PublicItem = {
  id: string
  type: 'question' | 'explanation'
  skillId: number
  difficulty: 1 | 2 | 3
  facet: 'conceptual' | 'procedural' | 'application'
  prompt: string
  format?: ItemFormat
  choices?: string[]
  board?: string[]
  /** For explanations: where in the student's material the explanation comes from. */
  sources?: { materialId?: number; lessonId?: number; pages?: number[]; quote?: string }[]
  /** For teaching items: the question whose wrong or partial answer they follow up. */
  follows?: string
  /** For teaching items: 1 or 2, the round of explanation and practice. */
  round?: 1 | 2
}

/** What grading needs. Stored only in private.item_keys. */
export type ItemKey = {
  accepted: string[]
  /** Absolute or relative tolerance for numeric answers. */
  tolerance?: { abs?: number; rel?: number }
  /** Variables an expression answer may use, e.g. ["p", "n"]. */
  variables?: string[]
  /** Points a complete answer shows. Required unless marked optional; partial credit needs at least one required. */
  rubric?: { point: string; required?: boolean }[]
  misconceptions?: { answer: string; tag: string; verdict?: 'partial' | 'incorrect' }[]
  /** Shown one at a time, and counted, by private.reveal_hint. */
  hints?: string[]
  solution: string
}

export type NewItem = PublicItem & { key?: ItemKey }

/**
 * The student-facing copy of an item, built field by field from an allowlist so nothing from the key can slip in,
 * whatever the item object carries.
 */
export function publicItem(item: NewItem): PublicItem {
  const out: PublicItem = {
    id: item.id,
    type: item.type,
    skillId: item.skillId,
    difficulty: item.difficulty,
    facet: item.facet,
    prompt: item.prompt,
  }
  if (item.format) out.format = item.format
  if (item.choices) out.choices = item.choices.map(String)
  if (item.board) out.board = item.board.map(String)
  if (item.sources)
    out.sources = item.sources.map((s) => ({
      materialId: s.materialId,
      lessonId: s.lessonId,
      pages: s.pages,
      quote: s.quote,
    }))
  if (item.follows) out.follows = String(item.follows)
  if (item.round) out.round = item.round
  return out
}

export async function startSession(
  userId: string,
  courseId: number | null,
  mode: 'quick_check' | 'guided_review' | 'learn_from_scratch',
  skillIds: number[],
  policyVersion: string,
) {
  return call(async () => {
    const [row] = await db()`
      select private.session_start(${userId}::uuid, ${courseId}::bigint, ${mode}, ${skillIds}::bigint[], ${policyVersion}) as id`
    return Number(row.id)
  })
}

export async function addItems(userId: string, sessionId: number, items: NewItem[]) {
  const payload = items.map((item) => {
    const { prompt, format, choices, board, sources, follows, round } = publicItem(item)
    return {
      id: item.id,
      type: item.type,
      skill_id: item.skillId,
      difficulty: item.difficulty,
      facet: item.facet,
      public: { prompt, format, choices, board, sources, follows, round },
      key: item.type === 'question' ? item.key : null,
    }
  })
  return call(async () => {
    const sql = db()
    const [row] =
      await sql`select private.session_add_items(${userId}::uuid, ${sessionId}::bigint, ${sql.json(payload as never)}) as n`
    return Number(row.n)
  })
}

export async function itemForGrading(userId: string, sessionId: number, itemId: string) {
  return call(async () => {
    const [row] = await db()`select * from private.session_item(${userId}::uuid, ${sessionId}::bigint, ${itemId})`
    if (!row) throw new HttpError(404, 'That question does not exist or is not yours.')
    return {
      skillId: Number(row.skill_id),
      difficulty: Number(row.difficulty) as 1 | 2 | 3,
      facet: row.facet as PublicItem['facet'],
      public: row.public as Record<string, unknown>,
      key: row.key as ItemKey,
      /** A final answer exists (anything but a first unclear one). */
      answered: row.answered as boolean,
      unclearAnswers: Number(row.unclear_answers),
      hintsRevealed: Number(row.hints_revealed),
    }
  })
}

/** Shows the next hint of an unanswered question and counts it. `hint` is null when none is left. */
export async function revealHint(userId: string, sessionId: number, itemId: string) {
  return call(async () => {
    const [row] = await db()`select * from private.reveal_hint(${userId}::uuid, ${sessionId}::bigint, ${itemId})`
    return {
      hint: (row?.hint as string | null) ?? null,
      shown: Number(row?.shown ?? 0),
      remaining: Number(row?.remaining ?? 0),
    }
  })
}

/** Records the session's active time so far (never lowers it). */
export async function touchSession(userId: string, sessionId: number, activeSeconds: number) {
  await call(
    () =>
      db()`select private.session_touch(${userId}::uuid, ${sessionId}::bigint, ${Math.round(activeSeconds)}::integer)`,
  )
}

export type AttemptFacts = {
  answer: string
  verdict: 'correct' | 'partial' | 'incorrect' | 'unclear'
  source?: 'quick_check' | 'practice' | 'reassessment'
  hintsUsed?: number
  explainedBefore?: boolean
  teachingRound?: 0 | 1 | 2
  followsEventId?: number | null
  rubricMet?: number | null
  rubricTotal?: number | null
  grader: 'rule' | 'model'
  graderVersion: string
  doubleGraded?: boolean | null
  needsReview?: boolean
  gradeConfidence?: number | null
  errorTag?: string | null
  timeToAnswerSeconds?: number | null
  activeSeconds?: number | null
}

/** Stores one graded answer. Whether it counts as independent is derived by the database from these facts. */
export async function recordAttempt(userId: string, sessionId: number, itemId: string, f: AttemptFacts) {
  const facts = {
    answer: f.answer.slice(0, 2000),
    verdict: f.verdict,
    source: f.source ?? 'quick_check',
    hints_used: f.hintsUsed ?? 0,
    explained_before: f.explainedBefore ?? false,
    teaching_round: f.teachingRound ?? 0,
    follows_event_id: f.followsEventId ?? null,
    rubric_met: f.rubricMet ?? null,
    rubric_total: f.rubricTotal ?? null,
    grader: f.grader,
    grader_version: f.graderVersion,
    double_graded: f.doubleGraded ?? null,
    needs_review: f.needsReview ?? false,
    grade_confidence: f.gradeConfidence ?? null,
    error_tag: f.errorTag ?? null,
    time_to_answer_seconds: f.timeToAnswerSeconds ?? null,
    active_seconds: f.activeSeconds ?? null,
  }
  return call(async () => {
    const sql = db()
    const [row] =
      await sql`select private.record_attempt(${userId}::uuid, ${sessionId}::bigint, ${itemId}, ${sql.json(facts as never)}) as id`
    return Number(row.id)
  })
}

export async function finishSession(
  userId: string,
  sessionId: number,
  status: 'completed' | 'stopped',
  summary: unknown,
  activeSeconds?: number,
) {
  await call(async () => {
    const sql = db()
    await sql`select private.session_finish(${userId}::uuid, ${sessionId}::bigint, ${status}, ${sql.json(summary as never)}, ${activeSeconds ?? null}::integer)`
  })
}

// Account deletion --------------------------------------------------------------------------------------------

export async function pendingAccountDeletions(limit = 20): Promise<string[]> {
  const rows = await db()`select * from private.account_deletions_pending(${limit}::integer) as user_id`
  return rows.map((r) => r.user_id as string)
}

export async function markAccountFilesDeleted(userId: string, error: string | null = null) {
  await db()`select private.account_files_deleted(${userId}::uuid, ${error})`
}
