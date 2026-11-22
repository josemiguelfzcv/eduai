import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  claudeCost,
  onUsage,
  recordUsage,
  tokensFromSdk,
  transcriptionCost,
  userTag,
  voiceCost,
  type UsageRecord,
} from '../app/lib/server/usage'

process.env.LYCEO_USAGE_LOG = 'off'
const t = (inputTokens: number, outputTokens: number, cacheReadTokens = 0, cacheWriteTokens = 0) => ({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
})

test('Claude cost uses list prices per million tokens, including the prompt cache', () => {
  assert.equal(claudeCost('claude-sonnet-4-6', t(1000, 500)), 0.0105)
  assert.equal(claudeCost('claude-sonnet-5-5', t(3000, 2500, 6000)), 0.0316)
  assert.equal(claudeCost('claude-sonnet-5-5', t(3000, 2500, 0, 6000)), 0.046)
  assert.equal(claudeCost('claude-haiku-5-5', t(2000, 250)), 0.000325)
  // Haiku 5.5 prompts over 100,000 tokens pay the higher rate on the whole request.
  assert.equal(claudeCost('claude-haiku-5-5', t(120_000, 1000)), 0.0625)
  assert.equal(claudeCost('claude-unknown', t(1, 1)), null)
})

test('voice and transcription costs', () => {
  assert.equal(voiceCost('eleven_multilingual_v2', 7200), 0.576)
  assert.equal(voiceCost('eleven_flash_v2_5', 7200), 0.288)
  assert.equal(voiceCost('something-else', 100), null)
  assert.equal(transcriptionCost('whisper-1', 3000), 0.3)
  assert.equal(transcriptionCost('gpt-transcribe', 3000), 0.225)
})

test('AI SDK usage splits into cached and uncached tokens', () => {
  assert.deepEqual(
    tokensFromSdk({
      inputTokens: 9000,
      outputTokens: 2500,
      inputTokenDetails: { noCacheTokens: 3000, cacheReadTokens: 6000, cacheWriteTokens: 0 },
    }),
    t(3000, 2500, 6000, 0),
  )
  assert.deepEqual(tokensFromSdk({ inputTokens: 900, outputTokens: 10 }), t(900, 10))
})

test('records hash the user id, cost nothing on cache hits, and reach listeners', () => {
  const seen: UsageRecord[] = []
  const stop = onUsage((r) => seen.push(r))
  const voice = recordUsage({
    task: 'tts',
    provider: 'elevenlabs',
    model: 'eleven_multilingual_v2',
    characters: 1000,
    cached: true,
    latencyMs: 12,
    ok: true,
  })
  const stt = recordUsage({
    task: 'transcribe',
    provider: 'openai',
    model: 'whisper-1',
    seconds: 600,
    latencyMs: 9000,
    ok: true,
    userId: 'abc',
  })
  stop()
  recordUsage({ task: 'tts', provider: 'elevenlabs', model: 'eleven_v3', characters: 10, latencyMs: 1, ok: true })
  assert.equal(voice.costUsd, 0)
  assert.equal(stt.costUsd, 0.06)
  assert.equal(stt.user, userTag('abc'))
  assert.match(stt.user!, /^[0-9a-f]{12}$/)
  assert.equal(userTag(null), null)
  assert.equal(seen.length, 2)
  assert.ok(!('userId' in stt))
})
