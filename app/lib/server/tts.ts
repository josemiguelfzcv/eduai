import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

// Theo's voice. Override with env vars to try a different voice or a cheaper model.
export const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'
export const TTS_MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'
export const MAX_TTS_CHARS = 4000

let r2Client: S3Client | null = null
function r2() {
  r2Client ??= new S3Client({
    region: 'auto',
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  })
  return r2Client
}

let elevenClient: ElevenLabsClient | null = null
export function eleven() {
  elevenClient ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
  return elevenClient
}

const bucket = () => process.env.CLOUDFLARE_R2_BUCKET

/** Audio is cached by content: the same sentence in the same voice is generated once. */
export function cacheKey(text: string) {
  const hash = createHash('sha256').update(`${VOICE_ID}|${TTS_MODEL}|${text}`).digest('hex')
  return `tts/${hash}.mp3`
}

export async function cachedUrl(key: string): Promise<string | null> {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
  } catch {
    return null
  }
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 3600 })
}

export async function saveAudio(key: string, body: Uint8Array) {
  await r2().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: 'audio/mpeg' }))
}

// Speech URLs are signed so the public endpoint can't be used to spend ElevenLabs credits on arbitrary text.
function signingKey() {
  const secret = process.env.LYCEO_TTS_SECRET || process.env.ELEVENLABS_API_KEY || 'lyceo-dev'
  return createHash('sha256').update(`lyceo-tts:${secret}`).digest()
}

export function signText(text: string) {
  return createHmac('sha256', signingKey()).update(text).digest('hex')
}

export function verifyText(text: string, sig: string | null) {
  if (!sig || sig.length !== 64) return false
  const expected = Buffer.from(signText(text), 'hex')
  const given = Buffer.from(sig, 'hex')
  return given.length === expected.length && timingSafeEqual(expected, given)
}

export function speechUrl(text: string) {
  return `/api/speak?text=${encodeURIComponent(text)}&sig=${signText(text)}`
}
