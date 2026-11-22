// Migration 0000: row-level security for production's original tables (users, courses, session_events).
// The baseline reproduces production exactly as its audit showed it (row-level security off, every privilege granted
// to the API roles), so these tests show the exposure, show that 0000 closes it, and replay every query the app on
// main makes, as PostgREST would run it, to show that nothing the app does changes.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { as, createTestDb, errorCode, makeUser, skipReason, type TestDb, type Tx } from './harness'

const LESSON = JSON.stringify({ title: 'Bayes', segments: [{ concept: 'Base rates', check: { question: 'Why?' } }] })

describe('production before 0000', { skip: skipReason }, () => {
  let db: TestDb
  let a: string
  before(async () => {
    db = await createTestDb({ before: '0000_secure_legacy_tables.sql' })
    a = await makeUser(db, 'a@test.lyceo')
    await db.admin`insert into public.courses (user_id, title) values (${a}, 'A lesson')`
  })
  after(async () => db?.close())

  test('a visitor with only the public key can read and delete any student’s rows', async () => {
    const seen = await as(db, { role: 'anon' }, (tx) => tx`select email from public.users`)
    assert.deepEqual(
      seen.map((r) => r.email),
      ['a@test.lyceo'],
    )
    const removed = await as(db, { role: 'anon' }, (tx) => tx`delete from public.courses returning id`)
    assert.equal(removed.length, 1)
  })
})

describe('legacy tables after 0000', { skip: skipReason }, () => {
  let db: TestDb
  let a: string
  let b: string
  let lessonA: number
  const A = () => ({ role: 'authenticated' as const, sub: a })
  const B = () => ({ role: 'authenticated' as const, sub: b })

  before(async () => {
    db = await createTestDb()
    a = await makeUser(db, 'a@test.lyceo')
    b = await makeUser(db, 'b@test.lyceo')
  })
  after(async () => db?.close())

  test('visitors have no access at all', async () => {
    for (const table of ['users', 'courses', 'session_events']) {
      assert.equal(
        await errorCode(() => as(db, { role: 'anon' }, (tx) => tx.unsafe(`select * from public.${table}`))),
        '42501',
        `anon reads ${table}`,
      )
      assert.equal(
        await errorCode(() => as(db, { role: 'anon' }, (tx) => tx.unsafe(`delete from public.${table}`))),
        '42501',
        `anon deletes from ${table}`,
      )
    }
  })

  test('every query the app on main makes still works for the signed-in student', async () => {
    await as(db, A(), async (tx: Tx) => {
      // dashboard and profile: upsert the profile row, read it back
      await tx`insert into public.users (id, email, name, career, learning_style)
               values (${a}, 'a@test.lyceo', 'Ana', 'Statistics', 'visual')
               on conflict (id) do update set email = excluded.email, name = excluded.name,
                 career = excluded.career, learning_style = excluded.learning_style`
      const [profile] = await tx`select career, learning_style from public.users where id = ${a}`
      assert.equal(profile.learning_style, 'visual')

      // extract-pdf / transcribe: createCourse; synthesize: save the script
      const [created] = await tx`insert into public.courses (user_id, title, description, status)
                                 values (${a}, 'Lecture 14', 'text', 'extracted') returning id`
      lessonA = Number(created.id)
      await tx`update public.courses set script = ${LESSON}::jsonb, status = 'ready' where id = ${lessonA}`

      // class page (no user filter) and getOwnCourse
      const [page] = await tx`select script, status from public.courses where id = ${lessonA}`
      assert.equal(page.status, 'ready')
      const own = await tx`select id, title, script from public.courses where id = ${lessonA} and user_id = ${a}`
      assert.equal(own.length, 1)

      // check-answer: count earlier misses, record the answer
      await tx`select count(*) from public.session_events
               where user_id = ${a} and course_id = ${lessonA} and segment_index = 0 and correct = false`
      await tx`insert into public.session_events
                 (user_id, course_id, segment_index, question, answer, correct, time_to_answer_seconds)
               values (${a}, ${lessonA}, 0, 'Why?', 'base rates', false, 12)`

      // review: read attempts, write the review lesson
      const attempts = await tx`select segment_index, correct, answer, created_at from public.session_events
                                where user_id = ${a} and course_id = ${lessonA} order by created_at asc`
      assert.equal(attempts.length, 1)
      await tx`insert into public.courses (user_id, title, description, status, script)
               values (${a}, 'Review: Bayes', 'Review of Base rates', 'ready', ${LESSON}::jsonb) returning id`

      // learner model and dashboard list
      const events = await tx`select course_id, segment_index, correct, time_to_answer_seconds, created_at
                              from public.session_events where user_id = ${a} order by created_at asc limit 2000`
      const ids = events.map((e) => Number(e.course_id))
      const lessons = await tx`select id, title, script from public.courses where id in ${tx(ids)}`
      assert.equal(lessons.length, 1)
      const list = await tx`select id, title, status, created_at, script from public.courses
                            where user_id = ${a} order by created_at desc`
      assert.equal(list.length, 2)
    })
  })

  test('a first sign-in can still create its profile row', async () => {
    const [fresh] = await db.admin`insert into auth.users (email) values ('new@test.lyceo') returning id`
    await as(
      db,
      { role: 'authenticated', sub: fresh.id },
      (tx) =>
        tx`insert into public.users (id, email, name) values (${fresh.id}, 'new@test.lyceo', 'New')
         on conflict (id) do update set email = excluded.email, name = excluded.name`,
    )
    const [row] = await db.admin`select name from public.users where id = ${fresh.id}`
    assert.equal(row.name, 'New')
  })

  test('another student can neither see nor change those rows', async () => {
    assert.equal((await as(db, B(), (tx) => tx`select id from public.courses where id = ${lessonA}`)).length, 0)
    assert.equal((await as(db, B(), (tx) => tx`select email from public.users where id = ${a}`)).length, 0)
    assert.equal(
      (await as(db, B(), (tx) => tx`update public.courses set title = 'x' where id = ${lessonA} returning id`)).length,
      0,
    )
    assert.equal(
      (await as(db, B(), (tx) => tx`delete from public.session_events where user_id = ${a} returning id`)).length,
      0,
    )
    assert.equal(
      await errorCode(() =>
        as(db, B(), (tx) => tx`insert into public.courses (user_id, title) values (${a}, 'planted')`),
      ),
      '42501',
    )
    assert.equal(
      await errorCode(() =>
        as(
          db,
          B(),
          (tx) => tx`insert into public.users (id, email) values (${a}, 'stolen@test.lyceo')
                     on conflict (id) do update set email = excluded.email`,
        ),
      ),
      '42501',
    )
    // A check-in can't point at someone else's lesson (it would also block them from deleting that lesson).
    assert.equal(
      await errorCode(() =>
        as(
          db,
          B(),
          (tx) => tx`insert into public.session_events (user_id, course_id, segment_index, correct)
                     values (${b}, ${lessonA}, 0, true)`,
        ),
      ),
      '42501',
    )
    const [mine] = await db.admin`select title from public.courses where id = ${lessonA}`
    assert.equal(mine.title, 'Lecture 14')
  })

  test('signed-in students lose TRUNCATE, which would skip row-level security', async () => {
    assert.equal(await errorCode(() => as(db, A(), (tx) => tx`truncate public.session_events`)), '42501')
  })

  test('running 0000 a second time changes nothing', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const sql = readFileSync(
      join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '0000_secure_legacy_tables.sql'),
      'utf8',
    )
    await db.admin.unsafe(sql)
    const policies = await db.admin`select count(*)::int as n from pg_policy
      where polrelid in ('public.users'::regclass, 'public.courses'::regclass, 'public.session_events'::regclass)
        and polpermissive`
    assert.equal(policies[0].n, 3)
  })
})
