import 'server-only'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { trustedDbConfigured } from './trusted-db'

// Private storage for uploaded lectures and recordings, in its own R2 bucket (not the voice cache's).
//
//   1. The browser uploads straight to R2 with a presigned PUT for incoming/<user>/<material>. The URL works for ten
//      minutes, for that one key, with the declared type and exact size (both are signed).
//   2. The server checks what arrived (size, type, the file's first bytes) and only then copies it to
//      materials/<user>/<material> and deletes the incoming copy. A file that fails is deleted. A bucket lifecycle
//      rule deletes anything left in incoming/ after a day.
//   3. Files are never public and never handed out as links: the server reads them with its own credentials.
//
// Needs LYCEO_MATERIALS_BUCKET and an R2 token scoped to that bucket (LYCEO_MATERIALS_R2_*). Staging only for now;
// production keeps using UploadThing until the migration is approved.

const MiB = 1024 * 1024

export type FileRule = {
  kind: 'pdf' | 'audio'
  maxBytes: number
  label: string
  matches: (head: Uint8Array) => boolean
}

const ascii = (head: Uint8Array, at: number, text: string) =>
  text.split('').every((ch, i) => head[at + i] === ch.charCodeAt(0))
const isPdf = (h: Uint8Array) => {
  // The header may follow up to 1 KB of junk, which real PDF readers accept.
  for (let i = 0; i + 5 <= Math.min(h.length, 1024); i++) if (ascii(h, i, '%PDF-')) return true
  return false
}
const isMp3 = (h: Uint8Array) => ascii(h, 0, 'ID3') || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0)
const isMp4 = (h: Uint8Array) => ascii(h, 4, 'ftyp')
const isWav = (h: Uint8Array) => ascii(h, 0, 'RIFF') && ascii(h, 8, 'WAVE')
const isWebm = (h: Uint8Array) => h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3
const isOgg = (h: Uint8Array) => ascii(h, 0, 'OggS')

/** What can be uploaded. Audio stays under 25 MB, the transcription service's limit. */
export const FILE_RULES: Record<string, FileRule> = {
  'application/pdf': { kind: 'pdf', maxBytes: 32 * MiB, label: 'PDF', matches: isPdf },
  'audio/mpeg': { kind: 'audio', maxBytes: 25 * MiB, label: 'MP3', matches: isMp3 },
  'audio/mp4': { kind: 'audio', maxBytes: 25 * MiB, label: 'M4A', matches: isMp4 },
  'audio/x-m4a': { kind: 'audio', maxBytes: 25 * MiB, label: 'M4A', matches: isMp4 },
  'audio/wav': { kind: 'audio', maxBytes: 25 * MiB, label: 'WAV', matches: isWav },
  'audio/x-wav': { kind: 'audio', maxBytes: 25 * MiB, label: 'WAV', matches: isWav },
  'audio/webm': { kind: 'audio', maxBytes: 25 * MiB, label: 'WebM', matches: isWebm },
  'audio/ogg': { kind: 'audio', maxBytes: 25 * MiB, label: 'OGG', matches: isOgg },
}

/** Checks a declared upload before anything is created. Returns an error message, or null when it's acceptable. */
export function checkDeclaredFile(contentType: unknown, bytes: unknown): string | null {
  const rule = typeof contentType === 'string' ? FILE_RULES[contentType] : undefined
  if (!rule) return 'Upload a PDF or an audio recording (MP3, M4A, WAV, WebM or OGG).'
  if (!Number.isInteger(bytes) || (bytes as number) < 1) return 'That file is empty.'
  if ((bytes as number) > rule.maxBytes) return `${rule.label} files must be under ${rule.maxBytes / MiB} MB.`
  return null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function incomingKey(userId: string, materialId: number) {
  if (!UUID.test(userId) || !Number.isSafeInteger(materialId) || materialId < 1) throw new Error('Bad material key')
  return `incoming/${userId}/${materialId}`
}

export function materialKey(userId: string, materialId: number) {
  return incomingKey(userId, materialId).replace(/^incoming\//, 'materials/')
}

/** The storage operations Lyceo uses, so tests can swap R2 for an in-memory bucket. */
export interface MaterialStore {
  presignPut(key: string, contentType: string, bytes: number, expiresIn: number): Promise<string>
  head(key: string): Promise<{ bytes: number; contentType: string | null } | null>
  readStart(key: string, bytes: number): Promise<Uint8Array>
  read(key: string): Promise<Uint8Array>
  copy(from: string, to: string): Promise<void>
  remove(key: string): Promise<void>
  /** Deletes every object under a prefix. Returns how many were deleted. */
  removePrefix(prefix: string): Promise<number>
}

function r2Store(): MaterialStore | null {
  const bucket = process.env.LYCEO_MATERIALS_BUCKET
  const endpoint = process.env.LYCEO_MATERIALS_R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT
  const accessKeyId = process.env.LYCEO_MATERIALS_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.LYCEO_MATERIALS_R2_SECRET_ACCESS_KEY
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null
  const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } })
  const missing = (err: unknown) =>
    (err as { name?: string })?.name === 'NotFound' ||
    (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404
  const bytesOf = async (body: unknown) =>
    new Uint8Array(await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray())

  return {
    presignPut: (key, contentType, bytes, expiresIn) =>
      getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: bytes }),
        {
          expiresIn,
          // Sign both, so R2 rejects an upload of another type or size.
          signableHeaders: new Set(['content-type', 'content-length']),
        },
      ),
    head: async (key) => {
      try {
        const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return { bytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null }
      } catch (err) {
        if (missing(err)) return null
        throw err
      }
    },
    readStart: async (key, bytes) => {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }))
      return bytesOf(res.Body)
    },
    read: async (key) => bytesOf((await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body),
    copy: async (from, to) => {
      await s3.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${from}`, Key: to }))
    },
    remove: async (key) => {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
    removePrefix: async (prefix) => {
      let deleted = 0
      let token: string | undefined
      do {
        const page = await s3.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        )
        const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
        if (keys.length) {
          const res = await s3.send(
            new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }),
          )
          if (res.Errors?.length) throw new Error(`Could not delete ${res.Errors.length} files under ${prefix}`)
          deleted += keys.length
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return deleted
    },
  }
}

let store: MaterialStore | null | undefined
export function materialStore(): MaterialStore | null {
  if (store === undefined) store = r2Store()
  return store
}
export function setMaterialStoreForTests(s: MaterialStore | null | undefined) {
  store = s
}

/** Uploads go to R2 only where both private storage and the trusted server connection are configured. */
export function privateUploadsEnabled() {
  return materialStore() !== null && trustedDbConfigured()
}

export const UPLOAD_URL_SECONDS = 600

export async function prepareUpload(userId: string, materialId: number, contentType: string, bytes: number) {
  const s = materialStore()
  if (!s) throw new Error('Private uploads are not configured')
  const problem = checkDeclaredFile(contentType, bytes)
  if (problem) throw new Error(problem)
  const url = await s.presignPut(incomingKey(userId, materialId), contentType, bytes, UPLOAD_URL_SECONDS)
  return { url, method: 'PUT' as const, headers: { 'Content-Type': contentType }, expiresIn: UPLOAD_URL_SECONDS }
}

export type UploadCheck =
  { ok: true; key: string; bytes: number; kind: FileRule['kind'] } | { ok: false; reason: string; retryable: boolean }

/**
 * Validates what arrived in incoming/ against what was declared, and moves it to its final key. A file that fails
 * any check is deleted. Safe to call again if the previous call was interrupted.
 */
export async function finishUpload(
  userId: string,
  materialId: number,
  declaredBytes: number | null,
): Promise<UploadCheck> {
  const s = materialStore()
  if (!s) throw new Error('Private uploads are not configured')
  const incoming = incomingKey(userId, materialId)
  const final = materialKey(userId, materialId)

  const arrived = await s.head(incoming)
  if (!arrived) {
    // Interrupted after the copy: the file is already in place.
    const done = await s.head(final)
    if (done) {
      const rule = done.contentType ? FILE_RULES[done.contentType] : undefined
      if (rule) return { ok: true, key: final, bytes: done.bytes, kind: rule.kind }
    }
    return { ok: false, reason: 'The upload never arrived. Try uploading the file again.', retryable: true }
  }

  const reject = async (reason: string): Promise<UploadCheck> => {
    await s.remove(incoming)
    return { ok: false, reason, retryable: false }
  }
  const rule = arrived.contentType ? FILE_RULES[arrived.contentType] : undefined
  if (!rule) return reject('That kind of file is not supported.')
  if (arrived.bytes < 1 || arrived.bytes > rule.maxBytes)
    return reject(`${rule.label} files must be under ${rule.maxBytes / MiB} MB.`)
  if (declaredBytes !== null && arrived.bytes !== declaredBytes)
    return reject('The file changed during upload. Try again.')
  const head = await s.readStart(incoming, Math.min(1024, arrived.bytes))
  if (!rule.matches(head)) return reject(`That file doesn't look like a ${rule.label}.`)

  await s.copy(incoming, final)
  await s.remove(incoming)
  return { ok: true, key: final, bytes: arrived.bytes, kind: rule.kind }
}

/** Reads a material's file for text extraction or transcription. Only keys under the student's own prefix. */
export async function readMaterialFile(userId: string, key: string) {
  const s = materialStore()
  if (!s) throw new Error('Private uploads are not configured')
  if (!key.startsWith(`materials/${userId}/`)) throw new Error('That file is not this student’s')
  return s.read(key)
}

/** Deletes both copies a material may have. */
export async function deleteMaterialFiles(userId: string, materialId: number) {
  const s = materialStore()
  if (!s) throw new Error('Private uploads are not configured')
  await s.remove(incomingKey(userId, materialId))
  await s.remove(materialKey(userId, materialId))
}

/** Deletes every file of a student, for account deletion. */
export async function deleteAllFilesOf(userId: string) {
  const s = materialStore()
  if (!s) return 0
  if (!UUID.test(userId)) throw new Error('Bad user id')
  return (await s.removePrefix(`materials/${userId}/`)) + (await s.removePrefix(`incoming/${userId}/`))
}
