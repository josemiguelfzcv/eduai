import { NextRequest, NextResponse, after } from 'next/server'
import { DEMO_LESSON } from '../../lib/demo-lesson'
import { errorResponse, HttpError, requireUser } from '../../lib/server/auth'
import { estimateVoiceUsd, reserveUsage, settleUsage, type Reservation } from '../../lib/server/budget'
import { recordUsage } from '../../lib/server/usage'
import {
  cacheKey,
  cachedUrl,
  eleven,
  MAX_TTS_CHARS,
  saveAudio,
  speechUrl,
  TTS_MODEL,
  verifyText,
  VOICE_ID,
} from '../../lib/server/tts'

const DEMO_TEXTS = new Set(DEMO_LESSON.segments.map((s) => s.narration))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Plays Theo's voice for a signed piece of text.
 * Cached audio redirects to R2. New audio streams from ElevenLabs as it's generated,
 * so playback starts within a second, and a copy is saved to R2 for next time.
 */
export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text') ?? ''
  const sig = req.nextUrl.searchParams.get('sig')
  const userId = req.nextUrl.searchParams.get('u')
  if (userId !== null && !UUID.test(userId)) {
    return NextResponse.json({ error: 'This audio link is not valid.' }, { status: 403 })
  }
  if (!text || text.length > MAX_TTS_CHARS || !verifyText(text, sig, userId)) {
    return NextResponse.json({ error: 'This audio link is not valid.' }, { status: 403 })
  }

  const started = Date.now()
  const usage = { task: 'tts', provider: 'elevenlabs', model: TTS_MODEL, characters: text.length, userId } as const
  let reservation: Reservation = null
  try {
    const key = cacheKey(text)
    const cached = await cachedUrl(key)
    if (cached) {
      recordUsage({ ...usage, cached: true, latencyMs: Date.now() - started, ok: true })
      return NextResponse.redirect(cached, { status: 302, headers: { 'Cache-Control': 'no-store' } })
    }

    reservation = await reserveUsage({
      task: 'tts',
      provider: 'elevenlabs',
      model: TTS_MODEL,
      userId,
      estimateUsd: estimateVoiceUsd(TTS_MODEL, text.length),
    })
    const audio = await eleven().textToSpeech.stream(VOICE_ID, {
      text,
      modelId: TTS_MODEL,
      outputFormat: 'mp3_44100_128',
    })
    const latencyMs = Date.now() - started
    const record = recordUsage({ ...usage, latencyMs, ok: true })
    await settleUsage(reservation, { ok: true, costUsd: record.costUsd, characters: text.length, latencyMs })
    const [toClient, toCache] = audio.tee()
    const saving = new Response(toCache)
      .arrayBuffer()
      .then((buf) => saveAudio(key, new Uint8Array(buf)))
      .catch((err) => console.error('Could not cache audio', err))
    after(() => saving)

    return new Response(toClient, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    recordUsage({ ...usage, latencyMs: Date.now() - started, ok: false })
    await settleUsage(reservation, { ok: false, costUsd: null })
    return errorResponse(err, 'Could not generate audio.')
  }
}

/** Signs the narration of a lesson so the player can request it. */
export async function POST(req: NextRequest) {
  try {
    const { texts, demo } = await req.json()
    if (!Array.isArray(texts) || texts.length > 40) throw new HttpError(400, 'Send up to 40 texts.')
    const userId = demo ? null : (await requireUser(req)).user.id

    const urls = texts.map((t: unknown) => {
      if (typeof t !== 'string' || !t || t.length > MAX_TTS_CHARS) return null
      if (demo && !DEMO_TEXTS.has(t)) return null
      return speechUrl(t, userId)
    })
    return NextResponse.json({ urls })
  } catch (err) {
    return errorResponse(err, 'Could not prepare audio.')
  }
}
