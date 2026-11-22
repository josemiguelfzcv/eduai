import 'server-only'
import { createHash } from 'node:crypto'

/**
 * Usage and cost of every paid AI call, written as one JSON line per call to the server logs
 * (search the Vercel logs for "ai_usage"). Nothing is stored in the database yet.
 *
 * List prices in USD, checked 2026-11-22. Update them here when a provider changes its prices.
 */
const CLAUDE_PER_MTOK: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  // Haiku 5.5 is priced by prompt length; these are the rates for prompts up to 100,000 tokens.
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
}
const HAIKU_55_LONG = { input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 }

/** ElevenLabs, per 1,000 characters. */
const VOICE_PER_1K_CHARS: Record<string, number> = {
  eleven_multilingual_v2: 0.08,
  eleven_v3: 0.08,
  eleven_flash_v2_5: 0.04,
  eleven_turbo_v2_5: 0.04,
}

/** OpenAI transcription, per minute of audio. */
const TRANSCRIPTION_PER_MIN: Record<string, number> = {
  'whisper-1': 0.006,
  'gpt-transcribe': 0.0045,
}

export type TokenCounts = {
  /** Input tokens that were neither read from nor written to the prompt cache. */
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export type UsageEvent = {
  task: string
  provider: 'anthropic' | 'elevenlabs' | 'openai'
  model: string
  latencyMs: number
  ok: boolean
  tokens?: TokenCounts
  characters?: number
  seconds?: number
  /** True when the result came from our own cache and cost nothing. */
  cached?: boolean
  /** The Supabase user id. Only a short one-way hash of it is logged. */
  userId?: string | null
}

export type UsageRecord = Omit<UsageEvent, 'userId'> & { user: string | null; costUsd: number | null }

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

export function claudeCost(model: string, t: TokenCounts): number | null {
  const base = CLAUDE_PER_MTOK[model]
  if (!base) return null
  const prompt = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens
  const p = model === 'claude-haiku-5-5' && prompt > 100_000 ? HAIKU_55_LONG : base
  return round6(
    (t.inputTokens * p.input +
      t.outputTokens * p.output +
      t.cacheWriteTokens * p.cacheWrite +
      t.cacheReadTokens * p.cacheRead) /
      1e6,
  )
}

export function voiceCost(model: string, characters: number): number | null {
  const rate = VOICE_PER_1K_CHARS[model]
  return rate === undefined ? null : round6((characters / 1000) * rate)
}

export function transcriptionCost(model: string, seconds: number): number | null {
  const rate = TRANSCRIPTION_PER_MIN[model]
  return rate === undefined ? null : round6((seconds / 60) * rate)
}

/** Token counts from an AI SDK result's `usage`, split into the parts that are priced differently. */
export function tokensFromSdk(usage: {
  inputTokens?: number
  outputTokens?: number
  inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }
}): TokenCounts {
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens ?? 0
  const inputTokens =
    usage.inputTokenDetails?.noCacheTokens ?? Math.max(0, (usage.inputTokens ?? 0) - cacheReadTokens - cacheWriteTokens)
  return { inputTokens, outputTokens: usage.outputTokens ?? 0, cacheReadTokens, cacheWriteTokens }
}

/** A stable, non-reversible tag so costs can be grouped per student without logging who they are. */
export function userTag(userId: string | null | undefined) {
  if (!userId) return null
  return createHash('sha256').update(`lyceo-usage:${userId}`).digest('hex').slice(0, 12)
}

function costOf(e: UsageEvent): number | null {
  if (e.cached) return 0
  if (e.provider === 'anthropic') return e.tokens ? claudeCost(e.model, e.tokens) : null
  if (e.provider === 'elevenlabs') return e.characters === undefined ? null : voiceCost(e.model, e.characters)
  return e.seconds === undefined ? null : transcriptionCost(e.model, e.seconds)
}

type Listener = (record: UsageRecord) => void
const listeners = new Set<Listener>()

/** Receive every usage record in this process (used by the model benchmark and the tests). */
export function onUsage(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function recordUsage(event: UsageEvent): UsageRecord {
  const { userId, ...rest } = event
  const record: UsageRecord = { ...rest, user: userTag(userId), costUsd: costOf(event) }
  if (process.env.LYCEO_USAGE_LOG !== 'off') console.log(JSON.stringify({ event: 'ai_usage', ...record }))
  for (const listener of listeners) listener(record)
  return record
}
