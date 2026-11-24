import 'server-only'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Busy, CalendarStatus } from '../calendar'
import { HttpError } from './auth'
import { pgCode, trustedDb, trustedDbConfigured } from './trusted-db'

// Google Calendar on the server: the OAuth connection, the token kept for it, and the few calls Lyceo makes.
//
// Lyceo asks for two Calendar permissions and nothing else beyond the student's email (to show which Google account
// is connected): calendar.freebusy, to see when the student is busy (never what the events are), and
// calendar.app.created, to keep one calendar of its own, "Lyceo", with deadlines and the study sessions the student
// adds. Google's refresh token is encrypted here (AES-256-GCM, key CALENDAR_TOKEN_KEY, bound to the student's id)
// before it's stored through private.calendar_save (supabase/migrations/0008_calendar_connections.sql).

export const SCOPE_BUSY = 'https://www.googleapis.com/auth/calendar.freebusy'
export const SCOPE_WRITE = 'https://www.googleapis.com/auth/calendar.app.created'
const REQUESTED = ['openid', 'email', SCOPE_BUSY, SCOPE_WRITE]

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/calendar/v3'

export const STATE_COOKIE = 'lyceo_calendar'
const STATE_SECONDS = 10 * 60

// ---- settings ----

type Settings = { clientId: string; clientSecret: string; key: Buffer }

/** What the server has, or the names of what it's missing (never their values). */
export function calendarSettings(): Settings | { missing: string[] } {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  const rawKey = process.env.CALENDAR_TOKEN_KEY?.trim()
  const missing = [
    !clientId && 'GOOGLE_CALENDAR_CLIENT_ID',
    !clientSecret && 'GOOGLE_CALENDAR_CLIENT_SECRET',
    !rawKey && 'CALENDAR_TOKEN_KEY',
    !trustedDbConfigured() && 'LYCEO_SERVER_DATABASE_URL',
  ].filter((m): m is string => Boolean(m))
  if (missing.length || !clientId || !clientSecret || !rawKey) return { missing }
  // `openssl rand -base64 32` gives 32 bytes; anything else is hashed down to 32.
  const decoded = Buffer.from(rawKey, 'base64')
  const key = decoded.length === 32 ? decoded : createHash('sha256').update(rawKey).digest()
  return { clientId, clientSecret, key }
}

function settings(): Settings {
  const s = calendarSettings()
  if ('missing' in s) {
    console.error(`Google Calendar is not set up: missing ${s.missing.join(', ')}`)
    throw new HttpError(503, `Google Calendar isn’t set up on this server yet (missing ${s.missing.join(', ')}).`)
  }
  return s
}

// ---- the token, sealed ----

const b64 = (buf: Buffer) => buf.toString('base64url')

export function seal(userId: string, token: string, key = settings().key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(`lyceo-calendar:${userId}`))
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return ['v1', b64(iv), b64(cipher.getAuthTag()), b64(body)].join('.')
}

export function unseal(userId: string, sealed: string, key = settings().key) {
  const [version, iv, tag, body] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unknown token format')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(`lyceo-calendar:${userId}`))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
}

// ---- the OAuth round trip ----

const stateKey = (key: Buffer) => createHmac('sha256', key).update('lyceo-calendar-state').digest()
const sign = (key: Buffer, payload: string) => b64(createHmac('sha256', stateKey(key)).update(payload).digest())

/**
 * The state Google hands back to the callback: who asked (signed, so it can't be forged or changed) and a nonce that
 * must match a cookie in the browser that started, so nobody can finish a connection in someone else's browser.
 */
export function makeState(userId: string, now = Date.now(), key = settings().key) {
  const nonce = b64(randomBytes(16))
  const payload = b64(Buffer.from(JSON.stringify({ u: userId, n: nonce, e: Math.floor(now / 1000) + STATE_SECONDS })))
  return { state: `${payload}.${sign(key, payload)}`, nonce }
}

/** The student's id, if the state is genuine, current and from this browser; otherwise null. */
export function readState(state: string | null, nonce: string | undefined, now = Date.now(), key = settings().key) {
  if (!state || !nonce) return null
  const [payload, mac] = state.split('.')
  if (!payload || !mac) return null
  const expected = Buffer.from(sign(key, payload))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const { u, n, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof u !== 'string' || n !== nonce || typeof e !== 'number' || e < now / 1000) return null
    return u
  } catch {
    return null
  }
}

export function authUrl(options: { redirectUri: string; state: string; email?: string | null }) {
  const params = new URLSearchParams({
    client_id: settings().clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: REQUESTED.join(' '),
    access_type: 'offline',
    // Always ask, so Google always returns a refresh token (it only does on consent).
    prompt: 'consent',
    state: options.state,
  })
  if (options.email) params.set('login_hint', options.email)
  return `${AUTH_URL}?${params}`
}

/**
 * The address Google sends the student back to. On a Vercel preview that's the branch's own address, the one
 * registered with Google, whichever deployment address the student is on.
 */
export function callbackUrl(requestOrigin: string) {
  const branch = process.env.VERCEL_ENV === 'preview' ? process.env.VERCEL_BRANCH_URL : undefined
  return `${branch ? `https://${branch}` : requestOrigin}/api/calendar/callback`
}

// ---- talking to Google ----

let send: typeof fetch = (...args) => fetch(...args)
/** Tests replace the network. */
export function useFetch(f: typeof fetch) {
  send = f
}

export class GoogleError extends Error {
  constructor(
    public status: number,
    public reason: string,
  ) {
    super(`Google Calendar answered ${status} (${reason})`)
  }
}

async function form(url: string, body: Record<string, string>) {
  const res = await send(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new GoogleError(res.status, String(json.error ?? 'unknown'))
  return json
}

/** Exchanges the callback's code for tokens. */
export async function exchangeCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = settings()
  const json = await form(TOKEN_URL, {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const scopes = String(json.scope ?? '')
    .split(' ')
    .filter((s) => s === SCOPE_BUSY || s === SCOPE_WRITE)
  let email: string | null = null
  // The ID token came straight from Google's token endpoint over TLS, so its claims can be read as they are.
  const payload = typeof json.id_token === 'string' ? json.id_token.split('.')[1] : null
  if (payload) {
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (typeof claims.email === 'string') email = claims.email.slice(0, 320)
    } catch {}
  }
  return {
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    accessToken: String(json.access_token ?? ''),
    expiresIn: Number(json.expires_in ?? 3600),
    scopes,
    email,
  }
}

/** Tells Google to forget a token. Best effort: the connection is deleted on Lyceo's side either way. */
export async function revoke(token: string) {
  try {
    await send(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(8_000),
    })
  } catch (err) {
    console.error('Could not revoke a Google token', err)
  }
}

async function api(access: string, method: string, path: string, body?: unknown) {
  const res = await send(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 204) return null
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason ?? json?.error?.status ?? 'unknown'
    throw new GoogleError(res.status, String(reason))
  }
  return json
}

// ---- the stored connection ----

type Stored = {
  refresh_token: string
  scopes: string[]
  google_email: string | null
  calendar_id: string | null
  connected_at: Date
  expired_at: Date | null
  last_synced_at: Date | null
}

function db() {
  const sql = trustedDb()
  if (!sql) throw new HttpError(503, 'Google Calendar isn’t set up on this server yet.')
  return sql
}

/** The table's functions don't exist until migration 0008 runs. */
async function stored<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (pgCode(err) === '42883' || pgCode(err) === '3F000') {
      throw new HttpError(503, 'Google Calendar isn’t set up on this server yet (its table is missing).')
    }
    throw err
  }
}

async function load(userId: string): Promise<Stored | null> {
  const rows = await stored(() => db()`select * from private.calendar_get(${userId}::uuid)`)
  return (rows[0] as unknown as Stored) ?? null
}

export async function saveConnection(userId: string, refreshToken: string, scopes: string[], email: string | null) {
  await stored(
    () => db()`select private.calendar_save(${userId}::uuid, ${seal(userId, refreshToken)}, ${scopes}, ${email})`,
  )
  accessCache.delete(userId)
}

async function note(userId: string, what: 'calendar' | 'expired' | 'synced', calendarId: string | null = null) {
  await stored(() => db()`select private.calendar_note(${userId}::uuid, ${what}, ${calendarId})`)
}

export async function calendarStatus(userId: string): Promise<CalendarStatus> {
  const off: CalendarStatus = {
    configured: false,
    connected: false,
    expired: false,
    email: null,
    canSeeBusy: false,
    canWrite: false,
    lastSyncedAt: null,
  }
  if ('missing' in calendarSettings()) return off
  let row: Stored | null
  try {
    row = await load(userId)
  } catch (err) {
    if (err instanceof HttpError && err.status === 503) return off
    throw err
  }
  if (!row) return { ...off, configured: true }
  return {
    configured: true,
    connected: true,
    expired: Boolean(row.expired_at),
    email: row.google_email,
    canSeeBusy: row.scopes.includes(SCOPE_BUSY),
    canWrite: row.scopes.includes(SCOPE_WRITE),
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
  }
}

/** Deletes the connection and revokes its token at Google. */
export async function disconnect(userId: string) {
  const rows = await stored(() => db()`select private.calendar_forget(${userId}::uuid) as token`)
  accessCache.delete(userId)
  const sealed = rows[0]?.token as string | null
  if (!sealed) return false
  try {
    await revoke(unseal(userId, sealed))
  } catch (err) {
    console.error('Could not read a calendar token to revoke it', err)
  }
  return true
}

/** The sealed token, read before an account is deleted (the row goes with the account), to revoke it after. */
export async function tokenToRevoke(userId: string): Promise<string | null> {
  if ('missing' in calendarSettings()) return null
  try {
    const row = await load(userId)
    return row ? unseal(userId, row.refresh_token) : null
  } catch {
    return null
  }
}

// ---- a working connection ----

const accessCache = new Map<string, { token: string; until: number }>()

export const EXPIRED_MESSAGE = 'Your Google Calendar connection expired. Connect it again.'

/** The stored connection and a current access token, or an error the student can act on. */
async function connection(userId: string, need: 'busy' | 'write') {
  const row = await load(userId)
  if (!row) throw new HttpError(404, 'Connect your Google Calendar first.')
  if (row.expired_at) throw new HttpError(409, EXPIRED_MESSAGE)
  if (!row.scopes.includes(need === 'busy' ? SCOPE_BUSY : SCOPE_WRITE)) {
    throw new HttpError(
      403,
      need === 'busy'
        ? 'Lyceo can’t see when you’re busy. Connect again and allow it.'
        : 'Lyceo can’t add events to your calendar. Connect again and allow it.',
    )
  }
  const cached = accessCache.get(userId)
  if (cached && cached.until > Date.now()) return { row, access: cached.token }
  const { clientId, clientSecret } = settings()
  try {
    const json = await form(TOKEN_URL, {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: unseal(userId, row.refresh_token),
      grant_type: 'refresh_token',
    })
    const token = String(json.access_token)
    accessCache.set(userId, { token, until: Date.now() + (Number(json.expires_in ?? 3600) - 120) * 1000 })
    return { row, access: token }
  } catch (err) {
    if (err instanceof GoogleError && err.reason === 'invalid_grant') {
      await note(userId, 'expired')
      throw new HttpError(409, EXPIRED_MESSAGE)
    }
    throw err
  }
}

/** When the student is busy between two instants (their primary calendar). */
export async function busyBetween(userId: string, from: Date, to: Date): Promise<Busy[]> {
  const { access } = await connection(userId, 'busy')
  const json = await api(access, 'POST', '/freeBusy', {
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    items: [{ id: 'primary' }],
  })
  const primary = json?.calendars?.primary
  if (primary?.errors?.length) throw new GoogleError(502, String(primary.errors[0]?.reason ?? 'unknown'))
  return (primary?.busy ?? [])
    .filter((b: Busy) => typeof b?.start === 'string' && typeof b?.end === 'string')
    .map((b: Busy) => ({ start: new Date(b.start).toISOString(), end: new Date(b.end).toISOString() }))
}

// ---- Lyceo's own calendar ----

/** Lyceo's calendar, created the first time it's needed (or again, if the student deleted it in Google). */
async function withCalendar<T>(
  userId: string,
  timeZone: string,
  run: (access: string, calendarId: string) => Promise<T>,
): Promise<T> {
  const { row, access } = await connection(userId, 'write')
  const create = async () => {
    const made = await api(access, 'POST', '/calendars', {
      summary: 'Lyceo',
      description: 'Deadlines and study sessions from Lyceo. Lyceo only changes this calendar.',
      timeZone,
    })
    await note(userId, 'calendar', String(made.id))
    return String(made.id)
  }
  const id = row.calendar_id ?? (await create())
  try {
    return await run(access, id)
  } catch (err) {
    if (err instanceof GoogleError && (err.status === 404 || err.status === 410) && row.calendar_id) {
      return run(access, await create())
    }
    throw err
  }
}

type GoogleEvent = {
  id: string
  summary?: string
  description?: string
  status?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  extendedProperties?: { private?: Record<string, string> }
  [key: string]: unknown
}

const enc = encodeURIComponent

async function listEvents(access: string, calendarId: string, properties: Record<string, string>) {
  const query = new URLSearchParams({ maxResults: '2500', showDeleted: 'false' })
  for (const [k, v] of Object.entries(properties)) query.append('privateExtendedProperty', `${k}=${v}`)
  const json = await api(access, 'GET', `/calendars/${enc(calendarId)}/events?${query}`)
  return ((json?.items ?? []) as GoogleEvent[]).filter((e) => e.status !== 'cancelled')
}

/** Writes an event with a known id: updates it if it exists (even deleted), creates it otherwise. */
async function put(access: string, calendarId: string, event: GoogleEvent) {
  const body = { ...event, status: 'confirmed' }
  try {
    await api(access, 'PUT', `/calendars/${enc(calendarId)}/events/${enc(event.id)}`, body)
  } catch (err) {
    if (err instanceof GoogleError && err.status === 404) {
      await api(access, 'POST', `/calendars/${enc(calendarId)}/events`, body)
      return
    }
    throw err
  }
}

async function remove(access: string, calendarId: string, eventId: string) {
  try {
    await api(access, 'DELETE', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`)
  } catch (err) {
    if (err instanceof GoogleError && (err.status === 404 || err.status === 410)) return
    throw err
  }
}

/** Runs tasks a few at a time, so a long list doesn't hit Google's rate limit. */
async function inBatches<T>(items: T[], run: (item: T) => Promise<unknown>, size = 4) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(run))
}

// Event ids may only use the letters a to v and digits (base32hex), at least 5 characters.
export const deadlineEventId = (deadlineId: number) => `deadline${deadlineId}`
export const sessionEventId = (day: string, index: number) => `session${day.replace(/-/g, '')}n${index}`

const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export type DeadlineForCalendar = {
  id: number
  title: string
  kindLabel: string
  dueOn: string
  topics: string | null
  course: string | null
}

export function deadlineEvent(d: DeadlineForCalendar): GoogleEvent {
  return {
    id: deadlineEventId(d.id),
    summary: `${d.kindLabel}: ${d.title}${d.course ? ` (${d.course})` : ''}`,
    description: [d.topics && `Topics: ${d.topics}`, 'From your deadlines in Lyceo.'].filter(Boolean).join('\n\n'),
    start: { date: d.dueOn },
    end: { date: nextDay(d.dueOn) },
    // A deadline is a whole day's marker, not time taken: it doesn't make the student look busy.
    transparency: 'transparent',
    // A reminder the day before, at 9 am (15 hours before the day starts).
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 * 60 }] },
    extendedProperties: { private: { lyceo: 'deadline', deadline: String(d.id) } },
  }
}

const same = (a: GoogleEvent, b: GoogleEvent) =>
  a.summary === b.summary &&
  (a.description ?? '') === (b.description ?? '') &&
  a.start?.date === b.start?.date &&
  a.end?.date === b.end?.date

/**
 * Makes the Lyceo calendar show exactly the student's open deadlines: adds new ones, updates changed ones, removes
 * finished and deleted ones. Returns how many events it wrote or removed.
 */
export async function syncDeadlines(userId: string, deadlines: DeadlineForCalendar[], timeZone: string) {
  return withCalendar(userId, timeZone, async (access, calendarId) => {
    const existing = await listEvents(access, calendarId, { lyceo: 'deadline' })
    const wanted = deadlines.map(deadlineEvent)
    const wantedIds = new Set(wanted.map((e) => e.id))
    const stale = existing.filter((e) => !wantedIds.has(e.id))
    const changed = wanted.filter((w) => {
      const have = existing.find((e) => e.id === w.id)
      return !have || !same(have, w)
    })
    await inBatches(stale, (e) => remove(access, calendarId, e.id))
    await inBatches(changed, (e) => put(access, calendarId, e))
    await note(userId, 'synced')
    return { written: changed.length, removed: stale.length }
  })
}

export type SessionForCalendar = { start: string; end: string; summary: string; description: string }

/** Puts a day's study sessions on the Lyceo calendar, replacing the ones Lyceo put there for that day before. */
export async function writeSessions(userId: string, day: string, sessions: SessionForCalendar[], timeZone: string) {
  return withCalendar(userId, timeZone, async (access, calendarId) => {
    const existing = await listEvents(access, calendarId, { lyceo: 'study', day })
    const events: GoogleEvent[] = sessions.map((s, i) => ({
      id: sessionEventId(day, i),
      summary: s.summary,
      description: s.description,
      start: { dateTime: s.start, timeZone },
      end: { dateTime: s.end, timeZone },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
      extendedProperties: { private: { lyceo: 'study', day } },
    }))
    const ids = new Set(events.map((e) => e.id))
    await inBatches(
      existing.filter((e) => !ids.has(e.id)),
      (e) => remove(access, calendarId, e.id),
    )
    await inBatches(events, (e) => put(access, calendarId, e))
    return { written: events.length }
  })
}
