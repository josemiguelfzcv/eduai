// Google Calendar connections (supabase/migrations/0008_calendar_connections.sql), against a database that behaves
// like Supabase. Run with: TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:db
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { as, createTestDb, errorCode, makeUser, skipReason, type TestDb } from './harness'

let db: TestDb
let a: string
let b: string
const TOKEN = 'v1.aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc'
const SCOPES = ['https://www.googleapis.com/auth/calendar.freebusy']

describe('calendar connections', { skip: skipReason }, () => {
  before(async () => {
    db = await createTestDb()
    a = await makeUser(db, 'a@example.com')
    b = await makeUser(db, 'b@example.com')
  })
  after(async () => db?.close())

  test('students and visitors cannot read the table or call the functions', async () => {
    await db.server`select private.calendar_save(${a}, ${TOKEN}, ${SCOPES}, 'a@gmail.com')`
    for (const who of [{ role: 'anon' as const }, { role: 'authenticated' as const, sub: a }]) {
      assert.equal(await errorCode(() => as(db, who, (tx) => tx`select * from private.calendar_connections`)), '42501')
      assert.equal(await errorCode(() => as(db, who, (tx) => tx`select * from private.calendar_get(${a})`)), '42501')
      assert.equal(await errorCode(() => as(db, who, (tx) => tx`select private.calendar_forget(${a})`)), '42501')
    }
  })

  test('the server reaches the table only through the functions', async () => {
    assert.equal(await errorCode(() => db.server`select * from private.calendar_connections`), '42501')
    assert.equal(await errorCode(() => db.server`delete from private.calendar_connections`), '42501')
  })

  test('a connection is saved, read back and noted', async () => {
    const [row] = await db.server`select * from private.calendar_get(${a})`
    assert.equal(row.refresh_token, TOKEN)
    assert.deepEqual(row.scopes, SCOPES)
    assert.equal(row.google_email, 'a@gmail.com')
    assert.equal(row.calendar_id, null)

    const [{ ok }] =
      await db.server`select private.calendar_note(${a}, 'calendar', 'lyceo-cal@group.calendar.google.com') as ok`
    assert.equal(ok, true)
    await db.server`select private.calendar_note(${a}, 'synced')`
    await db.server`select private.calendar_note(${a}, 'expired')`
    const [noted] = await db.server`select * from private.calendar_get(${a})`
    assert.equal(noted.calendar_id, 'lyceo-cal@group.calendar.google.com')
    assert.ok(noted.last_synced_at && noted.expired_at)

    const [{ ok: none }] = await db.server`select private.calendar_note(${b}, 'synced') as ok`
    assert.equal(none, false, 'a student with no connection')
    assert.equal(await errorCode(() => db.server`select private.calendar_note(${a}, 'anything')`), '22023')
  })

  test('connecting again clears the expiry, and keeps the calendar only for the same Google account', async () => {
    await db.server`select private.calendar_save(${a}, ${TOKEN + 'x'}, ${SCOPES}, 'a@gmail.com')`
    const [same] = await db.server`select * from private.calendar_get(${a})`
    assert.equal(same.expired_at, null)
    assert.equal(same.calendar_id, 'lyceo-cal@group.calendar.google.com')

    await db.server`select private.calendar_save(${a}, ${TOKEN}, ${SCOPES}, 'other@gmail.com')`
    const [other] = await db.server`select * from private.calendar_get(${a})`
    assert.equal(other.calendar_id, null)
    assert.equal(other.google_email, 'other@gmail.com')
  })

  test('forgetting returns the token once and deletes the row', async () => {
    const [{ token }] = await db.server`select private.calendar_forget(${a}) as token`
    assert.equal(token, TOKEN)
    const [{ token: again }] = await db.server`select private.calendar_forget(${a}) as token`
    assert.equal(again, null)
    assert.equal((await db.server`select * from private.calendar_get(${a})`).length, 0)
  })

  test('deleting the account deletes the connection', async () => {
    await db.server`select private.calendar_save(${b}, ${TOKEN}, ${SCOPES}, null)`
    await db.admin`delete from public.users where id = ${b}`
    await db.admin`delete from auth.users where id = ${b}`
    assert.equal((await db.admin`select 1 from private.calendar_connections where user_id = ${b}`).length, 0)
  })
})
