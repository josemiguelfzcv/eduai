import 'server-only'
import { HttpError } from './auth'
import { pgCode, trustedDb } from './trusted-db'
import { CLAUDE_PER_MTOK, PRICE_VERSION, TRANSCRIPTION_PER_MIN, VOICE_PER_1K_CHARS, type TokenCounts } from './usage'

// Usage limits that hold even when many requests arrive at once. Before every paid call the server reserves its cost
// in Postgres (private.usage_reserve, one atomic statement per limit); afterwards it settles the real cost. Students
// can't reach these records: they live in schema private and only the lyceo_server role can call the functions.
//
// Without LYCEO_SERVER_DATABASE_URL (production today) reservations are skipped and nothing changes.

export type Reservation = { id: number } | null

export type Provider = 'anthropic' | 'elevenlabs' | 'openai'

/** A limit was reached. 429 for the student's own limits, 503 when the whole app is at its limit. */
export class UsageLimitError extends HttpError {
  constructor(public reason: 'daily' | 'busy' | 'app') {
    super(
      reason === 'app' ? 503 : 429,
      reason === 'daily'
        ? `You've reached today's study limit. It resets at midnight UTC (${resetsIn()}).`
        : reason === 'busy'
          ? 'Lyceo is still working on your last request. Try again in a moment.'
          : 'Lyceo is at capacity for today. Please try again later.',
    )
  }
}

function resetsIn(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  const hours = Math.max(1, Math.round((next - now.getTime()) / 3_600_000))
  return hours === 1 ? 'in about an hour' : `in about ${hours} hours`
}

/** Characters per token used to estimate prompts before they're sent. Deliberately low, so estimates run high. */
const CHARS_PER_TOKEN = 3

/** A ceiling for one Claude call: the whole prompt plus every output token it's allowed. */
export function estimateClaudeUsd(model: string, promptChars: number, maxOutputTokens: number) {
  const price = CLAUDE_PER_MTOK[model] ?? CLAUDE_PER_MTOK['claude-sonnet-4-6']
  const inputTokens = Math.ceil(promptChars / CHARS_PER_TOKEN) + 500
  const longPrompt = model === 'claude-haiku-5-5' && inputTokens > 100_000
  const input = longPrompt ? 0.5 : price.input
  const output = longPrompt ? 2.5 : price.output
  return round6((inputTokens * input + maxOutputTokens * output) / 1e6)
}

export function estimateVoiceUsd(model: string, characters: number) {
  return round6((characters / 1000) * (VOICE_PER_1K_CHARS[model] ?? 0.08))
}

/** Audio length isn't known before transcription, so it's bounded by size: no real file has fewer than 4 KB a second. */
export function estimateTranscriptionUsd(model: string, bytes: number) {
  const seconds = Math.min(bytes / 4000, 4 * 3600)
  return round6((seconds / 60) * (TRANSCRIPTION_PER_MIN[model] ?? 0.006))
}

export async function reserveUsage(opts: {
  task: string
  provider: Provider
  model: string
  userId: string | null | undefined
  estimateUsd: number
  studySessionId?: number | null
}): Promise<Reservation> {
  const sql = trustedDb()
  if (!sql) return null
  try {
    const [row] = await sql`
      select private.usage_reserve(
        ${opts.userId ?? null}::uuid, ${opts.task}, ${opts.provider}, ${opts.model},
        ${Math.min(opts.estimateUsd, 5)}::numeric, ${PRICE_VERSION}, ${opts.studySessionId ?? null}::bigint
      ) as id`
    return { id: Number(row.id) }
  } catch (err) {
    const code = pgCode(err)
    if (code === 'LY001') throw new UsageLimitError('daily')
    if (code === 'LY003') throw new UsageLimitError('busy')
    if (code === 'LY002') throw new UsageLimitError('app')
    // Fail closed: without a reservation the call doesn't happen.
    console.error('Could not reserve usage', err)
    throw new HttpError(503, 'Lyceo is having trouble right now. Please try again in a minute.')
  }
}

/** Records the real cost. Never throws: an unsettled reservation keeps counting at its estimate, which is safe. */
export async function settleUsage(
  reservation: Reservation,
  outcome: {
    ok: boolean
    costUsd: number | null
    tokens?: TokenCounts
    characters?: number
    seconds?: number
    latencyMs?: number
    cached?: boolean
  },
) {
  const sql = trustedDb()
  if (!sql || !reservation) return
  const t = outcome.tokens
  try {
    await sql`
      select private.usage_settle(
        ${reservation.id}::bigint, ${outcome.ok}, ${outcome.costUsd}::numeric,
        ${t?.inputTokens ?? null}::integer, ${t?.outputTokens ?? null}::integer,
        ${t?.cacheReadTokens ?? null}::integer, ${t?.cacheWriteTokens ?? null}::integer,
        ${outcome.characters ?? null}::integer, ${outcome.seconds ?? null}::numeric,
        ${outcome.latencyMs ?? null}::integer, ${outcome.cached ?? false}
      )`
  } catch (err) {
    console.error('Could not settle usage', err)
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6
