// The calendar server module against the real schema (as lyceo_server) and a fake Google Calendar in memory.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createTestDb, makeUser, skipReason, type TestDb } from './harness'

let db: TestDb
let a: string
type Calendar = typeof import('../../app/lib/server/calendar')
let cal: Calendar
let trusted: typeof import('../../app/lib/server/trusted-db')

type Event = { id: string; status: string; [k: string]: unknown }

/** Just enough of Google: tokens, freeBusy, calendars and events with private properties, and revocation. */
function fakeGoogle() {
  const calendars = new Map<string, Map<string, Event>>()
  const revoked: string[] = []
  const calls: string[] = []
  let made = 0
  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  const notFound = () => reply(404, { error: { errors: [{ reason: 'notFound' }] } })
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url.pathname}`)
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') {
      const form = new URLSearchParams(String(init?.body))
      if (form.get('refresh_token') === 'rt-dead') return reply(400, { error: 'invalid_grant' })
      return reply(200, { access_token: 'at-1', expires_in: 3600 })
    }
    if (url.pathname === '/revoke') {
      revoked.push(new URLSearchParams(String(init?.body)).get('token')!)
      return reply(200, {})
    }
    const auth = new Headers(init?.headers).get('authorization')
    if (auth !== 'Bearer at-1') return reply(401, { error: { status: 'UNAUTHENTICATED' } })
    const path = url.pathname.replace('/calendar/v3', '')
    if (path === '/freeBusy') {
      return reply(200, {
        calendars: { primary: { busy: [{ start: '2026-11-24T15:00:00Z', end: '2026-11-24T16:00:00Z' }] } },
      })
    }
    if (path === '/calendars' && method === 'POST') {
      const id = `lyceo-${++made}@group.calendar.google.com`
      calendars.set(id, new Map())
      return reply(200, { id })
    }
    const m = path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/)
    if (!m) return reply(400, {})
    const events = calendars.get(decodeURIComponent(m[1]))
    if (!events) return notFound()
    const id = m[2] && decodeURIComponent(m[2])
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (method === 'GET') {
      const wanted = url.searchParams.getAll('privateExtendedProperty').map((p) => p.split('='))
      const items = [...events.values()].filter(
        (e) =>
          e.status !== 'cancelled' &&
          wanted.every(([k, v]) => (e.extendedProperties as { private: Record<string, string> }).private[k] === v),
      )
      return reply(200, { items })
    }
    if (method === 'PUT') {
      if (!events.has(id!)) return notFound()
      events.set(id!, { ...body, id })
      return reply(200, body)
    }
    if (method === 'POST') {
      if (events.has(body.id)) return reply(409, { error: { errors: [{ reason: 'duplicate' }] } })
      events.set(body.id, body)
      return reply(200, body)
    }
    if (method === 'DELETE') {
      const e = events.get(id!)
      if (!e || e.status === 'cancelled') return reply(410, {})
      e.status = 'cancelled'
      return reply(204)
    }
    return reply(400, {})
  }) as typeof fetch
  return { fetcher, calendars, revoked, calls }
}

const deadline = (id: number, dueOn: string, title = `Task ${id}`) => ({
  id,
  title,
  kindLabel: 'Assignment',
  dueOn,
  topics: null,
  course: 'STAT 161',
})

describe('Google Calendar on the server', { skip: skipReason }, () => {
  let google: ReturnType<typeof fakeGoogle>
  before(async () => {
    db = await createTestDb()
    process.env.LYCEO_SERVER_DATABASE_URL = db.serverUrl
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id.apps.googleusercontent.com'
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret'
    process.env.CALENDAR_TOKEN_KEY = randomBytes(32).toString('base64')
    cal = await import('../../app/lib/server/calendar')
    trusted = await import('../../app/lib/server/trusted-db')
    google = fakeGoogle()
    cal.useFetch(google.fetcher)
    a = await makeUser(db, 'a@test.lyceo')
  })
  after(async () => {
    await trusted?.closeTrustedDb()
    for (const k of ['LYCEO_SERVER_DATABASE_URL', 'GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET'])
      delete process.env[k]
    delete process.env.CALENDAR_TOKEN_KEY
    await db?.close()
  })

  test('not connected yet', async () => {
    const status = await cal.calendarStatus(a)
    assert.equal(status.configured, true)
    assert.equal(status.connected, false)
  })

  test('the refresh token is stored encrypted, never as Google gave it', async () => {
    await cal.saveConnection(a, 'rt-good', [cal.SCOPE_BUSY, cal.SCOPE_WRITE], 'a@gmail.com')
    const [row] = await db.admin`select refresh_token from private.calendar_connections where user_id = ${a}`
    assert.ok(row.refresh_token.startsWith('v1.'))
    assert.ok(!row.refresh_token.includes('rt-good'))
    const status = await cal.calendarStatus(a)
    assert.deepEqual(
      { ...status, lastSyncedAt: null },
      {
        configured: true,
        connected: true,
        expired: false,
        email: 'a@gmail.com',
        canSeeBusy: true,
        canWrite: true,
        lastSyncedAt: null,
      },
    )
  })

  test('busy times, and only times', async () => {
    const busy = await cal.busyBetween(a, new Date('2026-11-24T05:00:00Z'), new Date('2026-11-25T05:00:00Z'))
    assert.deepEqual(busy, [{ start: '2026-11-24T15:00:00.000Z', end: '2026-11-24T16:00:00.000Z' }])
  })

  test('deadlines: the calendar is made once, events added, changed and removed', async () => {
    const first = await cal.syncDeadlines(a, [deadline(1, '2026-12-01'), deadline(2, '2026-12-05')], 'America/New_York')
    assert.deepEqual(first, { written: 2, removed: 0 })
    assert.equal(google.calendars.size, 1)
    const [calendarId] = google.calendars.keys()
    const [row] = await db.server`select calendar_id, last_synced_at from private.calendar_get(${a})`
    assert.equal(row.calendar_id, calendarId)
    assert.ok(row.last_synced_at)

    const again = await cal.syncDeadlines(a, [deadline(1, '2026-12-01'), deadline(2, '2026-12-05')], 'UTC')
    assert.deepEqual(again, { written: 0, removed: 0 }, 'nothing changed, nothing written')

    const changed = await cal.syncDeadlines(a, [deadline(1, '2026-12-02', 'Problem set 9')], 'UTC')
    assert.deepEqual(changed, { written: 1, removed: 1 })
    const events = [...google.calendars.get(calendarId)!.values()].filter((e) => e.status !== 'cancelled')
    assert.deepEqual(
      events.map((e) => [e.id, e.summary, (e.start as { date: string }).date]),
      [['deadline1', 'Assignment: Problem set 9 (STAT 161)', '2026-12-02']],
    )

    // A deadline that was removed and comes back (same id) is restored, not refused as a duplicate.
    const back = await cal.syncDeadlines(
      a,
      [deadline(1, '2026-12-02', 'Problem set 9'), deadline(2, '2026-12-05')],
      'UTC',
    )
    assert.deepEqual(back, { written: 1, removed: 0 })
  })

  test('if the student deleted the Lyceo calendar in Google, a new one is made', async () => {
    google.calendars.clear()
    await cal.syncDeadlines(a, [deadline(3, '2026-12-09')], 'UTC')
    assert.equal(google.calendars.size, 1)
    const [row] = await db.server`select calendar_id from private.calendar_get(${a})`
    assert.equal(row.calendar_id, [...google.calendars.keys()][0])
  })

  test('study sessions replace that day’s earlier ones', async () => {
    const day = '2026-11-24'
    const s = (start: string, end: string) => ({ start, end, summary: 'Study', description: '' })
    await cal.writeSessions(
      a,
      day,
      [s('2026-11-24T13:00:00Z', '2026-11-24T13:30:00Z'), s('2026-11-24T14:00:00Z', '2026-11-24T14:20:00Z')],
      'America/New_York',
    )
    await cal.writeSessions(a, day, [s('2026-11-24T18:00:00Z', '2026-11-24T18:45:00Z')], 'America/New_York')
    const [calendarId] = google.calendars.keys()
    const live = [...google.calendars.get(calendarId)!.values()].filter(
      (e) =>
        e.status !== 'cancelled' && (e.extendedProperties as { private: { lyceo: string } }).private.lyceo === 'study',
    )
    assert.deepEqual(
      live.map((e) => [e.id, (e.start as { dateTime: string }).dateTime]),
      [['session20261124n0', '2026-11-24T18:00:00Z']],
    )
  })

  test('when Google refuses the token, the connection is marked expired and the student is told', async () => {
    const b = await makeUser(db, 'b@test.lyceo')
    await cal.saveConnection(b, 'rt-dead', [cal.SCOPE_BUSY, cal.SCOPE_WRITE], null)
    await assert.rejects(
      cal.busyBetween(b, new Date('2026-11-24T05:00:00Z'), new Date('2026-11-25T05:00:00Z')),
      (err: Error & { status?: number }) => err.status === 409 && err.message === cal.EXPIRED_MESSAGE,
    )
    assert.equal((await cal.calendarStatus(b)).expired, true)
  })

  test('without the permission, Lyceo says which one is missing', async () => {
    const c = await makeUser(db, 'c@test.lyceo')
    await cal.saveConnection(c, 'rt-good', [cal.SCOPE_BUSY], null)
    await assert.rejects(cal.syncDeadlines(c, [deadline(9, '2026-12-01')], 'UTC'), (err: Error & { status?: number }) =>
      Boolean(err.status === 403 && /add events/.test(err.message)),
    )
  })

  test('disconnecting revokes the token at Google and forgets it', async () => {
    assert.equal(await cal.disconnect(a), true)
    assert.deepEqual(google.revoked, ['rt-good'])
    assert.equal((await cal.calendarStatus(a)).connected, false)
    assert.equal(await cal.disconnect(a), false)
  })
})
