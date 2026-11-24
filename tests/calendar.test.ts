import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { describe, test } from 'node:test'
import { planTimes, validTimeZone, zonedDay, zonedInstant, type PlanStep } from '../app/lib/calendar'
import {
  deadlineEvent,
  deadlineEventId,
  makeState,
  readState,
  seal,
  sessionEventId,
  unseal,
} from '../app/lib/server/calendar'

const NY = 'America/New_York'
const at = (day: string, time: string) => zonedInstant(day, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)), NY)
const local = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: NY, hourCycle: 'h23' })
const step = (key: string, minutes: number, title = key): PlanStep => ({ key, title, minutes, course: 'STAT 161' })

describe('time zones', () => {
  test('a local time becomes the right instant, either side of the daylight-saving change', () => {
    assert.equal(zonedInstant('2026-11-24', 9 * 60, NY).toISOString(), '2026-11-24T14:00:00.000Z')
    assert.equal(zonedInstant('2026-07-01', 9 * 60, NY).toISOString(), '2026-07-01T13:00:00.000Z')
    // Nov 1, 2026: clocks go back at 2 am. 8 am is EST.
    assert.equal(zonedInstant('2026-11-01', 8 * 60, NY).toISOString(), '2026-11-01T13:00:00.000Z')
    assert.equal(zonedInstant('2026-11-24', 0, 'Asia/Kolkata').toISOString(), '2026-11-23T18:30:00.000Z')
  })

  test('the local day of an instant', () => {
    assert.equal(zonedDay(new Date('2026-11-25T03:00:00Z'), NY), '2026-11-24')
    assert.equal(zonedDay(new Date('2026-11-25T03:00:00Z'), 'UTC'), '2026-11-25')
  })

  test('an unknown time zone falls back to UTC', () => {
    assert.equal(validTimeZone('America/New_York'), NY)
    assert.equal(validTimeZone('Mars/Olympus'), 'UTC')
    assert.equal(validTimeZone(42), 'UTC')
  })
})

describe('placing today’s steps in free time', () => {
  const day = '2026-11-24'

  test('steps go around what is on the calendar, with a margin, in order', () => {
    const { sessions, unplaced } = planTimes({
      day,
      timeZone: NY,
      now: at(day, '07:00'),
      busy: [{ start: at(day, '08:30').toISOString(), end: at(day, '10:00').toISOString() }],
      steps: [step('a', 15), step('b', 20)],
    })
    assert.deepEqual(unplaced, [])
    // 8:00 to 8:20 is free (8:30 minus the 10-minute margin): 'a' fits there, 'b' doesn't, so it waits until 10:10.
    assert.deepEqual(
      sessions.map((s) => s.steps.map((t) => `${t.key} ${local(t.start)}-${local(t.end)}`)),
      [['a 08:00-08:15'], ['b 10:10-10:30']],
    )
  })

  test('a session runs at most 50 minutes, then a 10-minute break', () => {
    const { sessions } = planTimes({
      day,
      timeZone: NY,
      now: at(day, '07:00'),
      busy: [],
      steps: [step('a', 25), step('b', 25), step('c', 20)],
    })
    assert.deepEqual(
      sessions.map((s) => `${local(s.start)}-${local(s.end)} ${s.steps.map((t) => t.key).join('')}`),
      ['08:00-08:50 ab', '09:00-09:20 c'],
    )
  })

  test('nothing is placed in the past, and minutes round up to five', () => {
    const { sessions } = planTimes({
      day,
      timeZone: NY,
      now: at(day, '14:03'),
      busy: [],
      steps: [step('a', 12)],
    })
    assert.equal(local(sessions[0].start), '14:10')
    assert.equal(local(sessions[0].end), '14:25')
  })

  test('what doesn’t fit before the window closes is returned, with everything after it', () => {
    const { sessions, unplaced } = planTimes({
      day,
      timeZone: NY,
      now: at(day, '21:20'),
      busy: [],
      steps: [step('a', 20), step('b', 30), step('c', 5)],
    })
    assert.deepEqual(
      sessions.flatMap((s) => s.steps.map((t) => t.key)),
      ['a'],
    )
    assert.deepEqual(
      unplaced.map((s) => s.key),
      ['b', 'c'],
    )
  })

  test('a day that is all taken places nothing', () => {
    const { sessions, unplaced } = planTimes({
      day,
      timeZone: NY,
      now: at(day, '07:00'),
      busy: [{ start: at(day, '07:00').toISOString(), end: at(day, '23:00').toISOString() }],
      steps: [step('a', 10)],
    })
    assert.equal(sessions.length, 0)
    assert.equal(unplaced.length, 1)
  })
})

describe('the stored token and the OAuth state', () => {
  const key = randomBytes(32)
  const user = '8d0c8a52-5a3e-4c43-9a9a-1b2c3d4e5f60'

  test('a sealed token opens only with the same key and the same student', () => {
    const sealed = seal(user, '1//refresh-token-from-google', key)
    assert.ok(!sealed.includes('refresh-token'))
    assert.equal(unseal(user, sealed, key), '1//refresh-token-from-google')
    assert.throws(() => unseal('someone-else', sealed, key))
    assert.throws(() => unseal(user, sealed, randomBytes(32)))
    const [v, iv, tag, body] = sealed.split('.')
    const flipped = body.slice(0, -2) + (body.slice(-2) === 'AA' ? 'AB' : 'AA')
    assert.throws(() => unseal(user, [v, iv, tag, flipped].join('.'), key))
  })

  test('the state is accepted once signed, current and with the browser’s nonce', () => {
    const now = Date.parse('2026-11-24T15:00:00Z')
    const { state, nonce } = makeState(user, now, key)
    assert.equal(readState(state, nonce, now + 60_000, key), user)
    assert.equal(readState(state, 'another-nonce', now, key), null, 'another browser')
    assert.equal(readState(state, undefined, now, key), null, 'no cookie')
    assert.equal(readState(state, nonce, now + 11 * 60_000, key), null, 'too late')
    assert.equal(readState(state, nonce, now, randomBytes(32)), null, 'another key')
    const [payload, mac] = state.split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), u: 'attacker' }),
    ).toString('base64url')
    assert.equal(readState(`${forged}.${mac}`, nonce, now, key), null, 'changed payload')
  })
})

describe('events Lyceo writes', () => {
  test('event ids only use what Google allows (a-v, 0-9, at least 5 characters)', () => {
    for (const id of [deadlineEventId(1), deadlineEventId(98765), sessionEventId('2026-11-24', 11)]) {
      assert.match(id, /^[a-v0-9]{5,1024}$/)
    }
    assert.notEqual(sessionEventId('2026-11-24', 1), sessionEventId('2026-11-2', 41))
  })

  test('a deadline is an all-day event that doesn’t block time', () => {
    const e = deadlineEvent({
      id: 7,
      title: 'Midterm 2',
      kindLabel: 'Exam',
      dueOn: '2026-12-31',
      topics: 'Bayes, variance',
      course: 'STAT 161',
    })
    assert.equal(e.summary, 'Exam: Midterm 2 (STAT 161)')
    assert.deepEqual(e.start, { date: '2026-12-31' })
    assert.deepEqual(e.end, { date: '2027-01-01' })
    assert.equal(e.transparency, 'transparent')
    assert.match(String(e.description), /Topics: Bayes, variance/)
  })
})
