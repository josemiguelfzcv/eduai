// Security properties of the staging schema, checked against a database that behaves like Supabase.
// Run with: TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:db
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { as, createTestDb, errorCode, makeUser, skipReason, type TestDb } from './harness'

let db: TestDb
let a: string
let b: string
let courseA: number
let courseB: number
let skillA: number
let skillA2: number
let skillB: number

/** postgres.js wants a JSONValue; test data is plain JSON. */
const json = (value: unknown) => db.server.json(value as never)
const A = () => ({ role: 'authenticated' as const, sub: a })
const B = () => ({ role: 'authenticated' as const, sub: b })
const KEY = { accepted: ['0.25', '1/4'], solution: 'P(A|B) = 10/40 = 0.25', rubric: [{ point: 'divides by P(B)' }] }

async function startSession(user = a, skills = [skillA]) {
  const [row] = await db.server`select private.session_start(${user}, ${courseA}, 'quick_check', ${skills}, 'v1') as id`
  return Number(row.id)
}
async function addQuestion(
  session: number,
  id = 'q1',
  user = a,
  publicPart: object = { prompt: 'P(A|B)?', format: 'number' },
) {
  const items = [
    { id, type: 'question', skill_id: skillA, difficulty: 2, facet: 'procedural', public: publicPart, key: KEY },
  ]
  await db.server`select private.session_add_items(${user}, ${session}, ${json(items)})`
}
async function attempt(session: number, item: string, facts: Record<string, unknown>) {
  const [row] =
    await db.server`select private.record_attempt(${a}, ${session}, ${item}, ${json({ answer: '0.25', verdict: 'correct', grader: 'rule', ...facts })}) as id`
  return Number(row.id)
}

describe('staging schema security', { skip: skipReason }, () => {
  before(async () => {
    db = await createTestDb()
    a = await makeUser(db, 'a@test.lyceo')
    b = await makeUser(db, 'b@test.lyceo')
    ;[{ id: courseA }] = await as(
      db,
      A(),
      (tx) => tx`insert into public.academy_courses (name) values ('Stat 161') returning id`,
    )
    ;[{ id: courseB }] = await as(
      db,
      B(),
      (tx) => tx`insert into public.academy_courses (name) values ('Econ 120') returning id`,
    )
    ;[{ id: skillA }] = await as(
      db,
      A(),
      (tx) =>
        tx`insert into public.skills (academy_course_id, name, facets) values (${courseA}, 'Conditional probability', '{conceptual,procedural}') returning id`,
    )
    ;[{ id: skillA2 }] = await as(
      db,
      A(),
      (tx) => tx`insert into public.skills (academy_course_id, name) values (${courseA}, 'Bayes rule') returning id`,
    )
    ;[{ id: skillB }] = await as(
      db,
      B(),
      (tx) => tx`insert into public.skills (academy_course_id, name) values (${courseB}, 'Elasticity') returning id`,
    )
    courseA = Number(courseA)
    courseB = Number(courseB)
    skillA = Number(skillA)
    skillA2 = Number(skillA2)
    skillB = Number(skillB)
  })
  after(async () => db?.close())

  describe('catalog', () => {
    test('every table in public has row-level security on', async () => {
      const off = await db.admin`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
      assert.deepEqual([...off], [])
    })

    test('visitors (anon) have no privileges on any table', async () => {
      const grants = await db.admin`
        select table_schema, table_name, privilege_type from information_schema.role_table_grants
        where grantee = 'anon' and table_schema in ('public', 'private')`
      assert.deepEqual([...grants], [])
    })

    test('the API roles cannot use schema private at all', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [{ usage }] = await db.admin`select has_schema_privilege(${role}, 'private', 'usage') as usage`
        assert.equal(usage, false, `${role} has usage on private`)
      }
    })

    test('lyceo_server is an ordinary role that can only execute functions', async () => {
      const [r] =
        await db.admin`select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = 'lyceo_server'`
      assert.deepEqual(r, { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false })
      const tables = await db.admin`
        select table_schema, table_name from information_schema.role_table_grants where grantee = 'lyceo_server'`
      assert.deepEqual([...tables], [], 'lyceo_server should not hold table privileges')
      const memberships = await db.admin`
        select r.rolname from pg_auth_members m join pg_roles r on r.oid = m.roleid
        join pg_roles u on u.oid = m.member where u.rolname = 'lyceo_server'`
      assert.deepEqual([...memberships], [])
    })

    test('every function in private is security definer with an empty search_path, and only lyceo_server runs it', async () => {
      const fns = await db.admin`
        select p.proname, p.prosecdef, p.proconfig,
               has_function_privilege('authenticated', p.oid, 'execute') as authed,
               has_function_privilege('anon', p.oid, 'execute') as anon,
               has_function_privilege('lyceo_server', p.oid, 'execute') as server
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'`
      assert.ok(fns.length >= 13)
      for (const f of fns) {
        assert.equal(f.prosecdef, true, `${f.proname} is not security definer`)
        assert.ok((f.proconfig ?? []).includes('search_path=""'), `${f.proname} has no fixed search_path`)
        assert.equal(f.server, true, `${f.proname} is not executable by lyceo_server`)
      }
    })

    test('the only function in public is delete_my_account, for signed-in students only', async () => {
      const fns = await db.admin`
        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
               has_function_privilege('authenticated', p.oid, 'execute') as authed,
               has_function_privilege('lyceo_server', p.oid, 'execute') as server
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`
      assert.deepEqual([...fns], [{ proname: 'delete_my_account', anon: false, authed: true, server: false }])
    })
  })

  describe('usage and cost records', () => {
    test('students and visitors cannot read, write or call anything in private', async () => {
      for (const who of [A(), { role: 'anon' as const }]) {
        assert.equal(await errorCode(() => as(db, who, (tx) => tx`select * from private.ai_usage`)), '42501')
        assert.equal(
          await errorCode(() =>
            as(
              db,
              who,
              (tx) => tx`insert into private.ai_usage (scope, task, provider, model, estimate_usd, price_version, day)
              values ('student', 'lesson', 'anthropic', 'x', 0, 'v', current_date)`,
            ),
          ),
          '42501',
        )
        assert.equal(
          await errorCode(() =>
            as(db, who, (tx) => tx`select private.usage_reserve(${a}, 'lesson', 'anthropic', 'x', 0.1, 'v')`),
          ),
          '42501',
        )
        assert.equal(await errorCode(() => as(db, who, (tx) => tx`select private.usage_settle(1, true, 0)`)), '42501')
      }
    })

    test('even the server can only use the functions, not the tables', async () => {
      assert.equal(await errorCode(() => db.server`select * from private.ai_usage`), '42501')
      assert.equal(await errorCode(() => db.server`update private.usage_days set spent_usd = 0`), '42501')
      assert.equal(await errorCode(() => db.server`delete from private.ai_usage`), '42501')
      assert.equal(await errorCode(() => db.server`update private.usage_limits set daily_usd = 1000`), '42501')
    })

    test('a reservation settles once, with its real cost', async () => {
      const [{ id }] =
        await db.server`select private.usage_reserve(${a}, 'lesson', 'anthropic', 'claude-sonnet-4-6', 0.2, '2026-11-22') as id`
      const [{ ok }] = await db.server`select private.usage_settle(${id}, true, 0.0371, 1200, 300) as ok`
      assert.equal(ok, true)
      const [{ ok: again }] = await db.server`select private.usage_settle(${id}, true, 0.0001) as ok`
      assert.equal(again, false, 'settling twice must change nothing')
      const [row] =
        await db.admin`select status, cost_usd::float as cost, input_tokens from private.ai_usage where id = ${id}`
      assert.deepEqual(row, { status: 'settled', cost: 0.0371, input_tokens: 1200 })
      const [day] =
        await db.admin`select reserved_usd::float as reserved, spent_usd::float as spent from private.usage_days
        where bucket = ${a} and day = (now() at time zone 'utc')::date`
      assert.deepEqual(day, { reserved: 0, spent: 0.0371 })
    })

    test('unknown prices are charged at the estimate; failed calls with no cost are free', async () => {
      const before = await spent(a)
      const [{ id: unpriced }] =
        await db.server`select private.usage_reserve(${a}, 'tts', 'elevenlabs', 'new-voice', 0.05, 'v') as id`
      await db.server`select private.usage_settle(${unpriced}, true, null)`
      const [{ id: failed }] =
        await db.server`select private.usage_reserve(${a}, 'tts', 'elevenlabs', 'new-voice', 0.05, 'v') as id`
      await db.server`select private.usage_settle(${failed}, false, null)`
      assert.equal(round((await spent(a)) - before), 0.05)
    })

    test('the daily limit holds under 30 concurrent requests', async () => {
      const user = await makeUser(db, 'burst@test.lyceo')
      await db.admin`update private.usage_limits set daily_usd = 1.00, max_in_flight = 100 where scope = 'student'`
      try {
        const results = await Promise.allSettled(
          Array.from(
            { length: 30 },
            () =>
              db.server`select private.usage_reserve(${user}, 'lesson', 'anthropic', 'claude-sonnet-4-6', 0.10, 'v')`,
          ),
        )
        const ok = results.filter((r) => r.status === 'fulfilled').length
        const codes = results.flatMap((r) => (r.status === 'rejected' ? [(r.reason as { code: string }).code] : []))
        assert.equal(ok, 10, 'exactly ten reservations of $0.10 fit in $1.00')
        assert.deepEqual([...new Set(codes)], ['LY001'])
        const [day] = await db.admin`select reserved_usd::float as reserved from private.usage_days
          where bucket = ${user} and day = (now() at time zone 'utc')::date`
        assert.equal(day.reserved, 1)
      } finally {
        await db.admin`update private.usage_limits set daily_usd = 1.50, max_in_flight = 4 where scope = 'student'`
      }
    })

    test('no more than max_in_flight calls run at once, and abandoned ones stop counting after 15 minutes', async () => {
      const user = await makeUser(db, 'inflight@test.lyceo')
      const results = await Promise.allSettled(
        Array.from(
          { length: 12 },
          () => db.server`select private.usage_reserve(${user}, 'grade', 'anthropic', 'claude-sonnet-4-6', 0.01, 'v')`,
        ),
      )
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 4)
      assert.ok(results.every((r) => r.status === 'fulfilled' || (r.reason as { code: string }).code === 'LY003'))

      // The server died mid-call: the reservations never settle. After 15 minutes they no longer block new calls,
      // but their estimates still count toward the daily limit.
      await db.admin`update private.ai_usage set created_at = now() - interval '16 minutes' where user_id = ${user}`
      const spentBefore = await reservedAndSpent(user)
      await db.server`select private.usage_reserve(${user}, 'grade', 'anthropic', 'claude-sonnet-4-6', 0.01, 'v')`
      assert.equal(round((await reservedAndSpent(user)) - spentBefore), 0.01)
    })

    test('the app-wide limit holds across students', async () => {
      const users = await Promise.all([1, 2, 3].map((n) => makeUser(db, `global${n}@test.lyceo`)))
      await db.admin`update private.usage_days set spent_usd = 0, reserved_usd = 0 where bucket = 'everyone'`
      await db.admin`update private.usage_limits set daily_usd = 0.50, max_in_flight = 100 where scope = 'everyone'`
      await db.admin`update private.usage_limits set max_in_flight = 100 where scope = 'student'`
      try {
        const results = await Promise.allSettled(
          users.flatMap((u) =>
            Array.from(
              { length: 6 },
              () => db.server`select private.usage_reserve(${u}, 'lesson', 'anthropic', 'm', 0.10, 'v')`,
            ),
          ),
        )
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5)
        assert.ok(results.every((r) => r.status === 'fulfilled' || (r.reason as { code: string }).code === 'LY002'))
      } finally {
        await db.admin`update private.usage_limits set daily_usd = 25, max_in_flight = 60 where scope = 'everyone'`
        await db.admin`update private.usage_limits set max_in_flight = 4 where scope = 'student'`
        await db.admin`update private.usage_days set spent_usd = 0, reserved_usd = 0 where bucket = 'everyone'`
      }
    })

    test('reserving and settling at the same time never deadlocks', async () => {
      const users = await Promise.all([1, 2].map((n) => makeUser(db, `mix${n}@test.lyceo`)))
      await db.admin`update private.usage_limits set max_in_flight = 100 where scope = 'student'`
      try {
        const ops = Array.from({ length: 40 }, async (_, i) => {
          const user = users[i % 2]
          const [{ id }] =
            await db.server`select private.usage_reserve(${user}, 'grade', 'anthropic', 'm', 0.001, 'v') as id`
          await db.server`select private.usage_settle(${id}, ${i % 3 !== 0}, ${i % 3 ? 0.0005 : null})`
        })
        const results = await Promise.allSettled(ops)
        const failures = results.filter((r) => r.status === 'rejected')
        assert.deepEqual(
          failures.map((f) => (f as PromiseRejectedResult).reason.code),
          [],
        )
      } finally {
        await db.admin`update private.usage_limits set max_in_flight = 4 where scope = 'student'`
      }
    })

    test('the demo has its own bucket', async () => {
      await db.server`select private.usage_reserve(null, 'grade', 'anthropic', 'm', 0.01, 'v')`
      const [row] = await db.admin`select scope, user_id from private.ai_usage where scope = 'visitor' limit 1`
      assert.deepEqual(row, { scope: 'visitor', user_id: null })
    })
  })

  describe('answer keys', () => {
    test('a student can read their session but never its keys', async () => {
      const session = await startSession()
      await addQuestion(session)
      const [row] = await as(db, A(), (tx) => tx`select items from public.study_sessions where id = ${session}`)
      const text = JSON.stringify(row.items)
      assert.match(text, /P\(A\|B\)\?/)
      for (const secret of ['0.25', '1/4', 'solution', 'accepted', 'rubric']) assert.ok(!text.includes(secret), secret)
      assert.equal(await errorCode(() => as(db, A(), (tx) => tx`select * from private.item_keys`)), '42501')
      assert.equal(
        await errorCode(() => as(db, A(), (tx) => tx`select private.session_item(${a}, ${session}, 'q1')`)),
        '42501',
      )
    })

    test('the server refuses an item that carries a key in its public part, at any depth', async () => {
      const session = await startSession()
      const leaky = [
        { prompt: 'x', answer: '0.25' },
        { prompt: 'x', choices: [{ text: '0.25', correct: true }, { text: '0.5' }] },
        { prompt: 'x', meta: { notes: { Solution: '10/40' } } },
      ]
      for (const [i, publicPart] of leaky.entries()) {
        assert.equal(await errorCode(() => addQuestion(session, `leak${i}`, a, publicPart)), '22023')
      }
    })

    test("nobody else can add to, read or answer a student's session", async () => {
      const session = await startSession()
      await addQuestion(session)
      assert.equal(await errorCode(() => addQuestion(session, 'q2', b)), '42501')
      assert.equal((await db.server`select * from private.session_item(${b}, ${session}, 'q1')`).length, 0)
      assert.equal(
        (await as(db, B(), (tx) => tx`select id from public.study_sessions where id = ${session}`)).length,
        0,
      )
      assert.equal(
        await errorCode(
          () => db.server`select private.record_attempt(${b}, ${session}, 'q1', ${json({ verdict: 'correct' })})`,
        ),
        '42501',
      )
      assert.equal(await errorCode(() => startSession(a, [skillB])), '42501')
    })

    test('students cannot create, edit or close study sessions themselves', async () => {
      const session = await startSession()
      assert.equal(
        await errorCode(() =>
          as(db, A(), (tx) => tx`insert into public.study_sessions (user_id, mode) values (${a}, 'quick_check')`),
        ),
        '42501',
      )
      assert.equal(
        await errorCode(() =>
          as(db, A(), (tx) => tx`update public.study_sessions set status = 'completed' where id = ${session}`),
        ),
        '42501',
      )
      assert.equal(
        await errorCode(() => as(db, A(), (tx) => tx`delete from public.study_sessions where id = ${session}`)),
        '42501',
      )
    })

    test('the solution becomes readable only with the answer that revealed it', async () => {
      const session = await startSession()
      await addQuestion(session)
      const event = await attempt(session, 'q1', { time_to_answer_seconds: 40 })
      const [row] = await as(
        db,
        A(),
        (tx) => tx`select item, verdict, correct from public.session_events where id = ${event}`,
      )
      assert.equal(row.item.solution, KEY.solution)
      assert.equal(row.verdict, 'correct')
      assert.equal(row.correct, true)
    })
  })

  describe('independent and assisted attempts', () => {
    test('a first try without help is independent; anything after help is assisted', async () => {
      const session = await startSession()
      await addQuestion(session, 'q1')
      await addQuestion(session, 'q2')
      await addQuestion(session, 'q3')
      const first = await attempt(session, 'q1', { verdict: 'incorrect', answer: '0.5', error_tag: 'divided by P(A)' })
      const retry = await attempt(session, 'q1', { verdict: 'correct' })
      const practice = await attempt(session, 'q2', {
        explained_before: true,
        teaching_round: 1,
        follows_event_id: first,
        source: 'practice',
      })
      const hinted = await attempt(session, 'q3', { hints_used: 1 })
      const rows = await db.admin`select id, attempt_mode, novel, teaching_round from public.session_events
        where id in (${first}, ${retry}, ${practice}, ${hinted}) order by id`
      assert.deepEqual(
        rows.map((r) => r.attempt_mode),
        ['independent', 'assisted', 'assisted', 'assisted'],
      )
      assert.equal(rows[1].novel, false)
    })

    test('a practice round must follow an explanation, and can only follow an answer in the same session', async () => {
      const session = await startSession()
      await addQuestion(session, 'q1')
      const other = await startSession()
      await addQuestion(other, 'q1')
      const elsewhere = await attempt(other, 'q1', { verdict: 'incorrect' })
      assert.equal(await errorCode(() => attempt(session, 'q1', { teaching_round: 1 })), '22023')
      assert.equal(
        await errorCode(() =>
          attempt(session, 'q1', { explained_before: true, teaching_round: 1, follows_event_id: elsewhere }),
        ),
        '42501',
      )
    })

    test('after an explanation of the skill, answers are assisted even if the server forgets to say so', async () => {
      const session = await startSession()
      await addQuestion(session, 'q1')
      const before = await attempt(session, 'q1', { verdict: 'incorrect' })
      const explanation = [
        {
          id: 'e1',
          type: 'explanation',
          skill_id: skillA,
          difficulty: 1,
          facet: 'conceptual',
          public: { prompt: 'Conditional probability narrows the world to B first.' },
        },
      ]
      await db.server`select private.session_add_items(${a}, ${session}, ${json(explanation)})`
      await addQuestion(session, 'q2')
      // explained_before deliberately omitted: the database derives it from the session's items.
      const afterwards = await attempt(session, 'q2', {
        teaching_round: 1,
        follows_event_id: before,
        source: 'practice',
      })
      const rows = await db.admin`select id, attempt_mode, explained_before from public.session_events
        where id in (${before}, ${afterwards}) order by id`
      assert.deepEqual(
        rows.map((r) => [r.attempt_mode, r.explained_before]),
        [
          ['independent', false],
          ['assisted', true],
        ],
      )
    })

    test('a skill with recorded answers can be hidden but not deleted by the student', async () => {
      const [{ id: skill }] = await as(
        db,
        A(),
        (tx) =>
          tx`insert into public.skills (academy_course_id, name) values (${courseA}, 'Law of total probability') returning id`,
      )
      const [{ id: unused }] = await as(
        db,
        A(),
        (tx) => tx`insert into public.skills (academy_course_id, name) values (${courseA}, 'Typo skill') returning id`,
      )
      const session = await startSession(a, [Number(skill)])
      const items = [
        {
          id: 'q1',
          type: 'question',
          skill_id: Number(skill),
          difficulty: 1,
          facet: 'procedural',
          public: { prompt: 'P(B)?' },
          key: KEY,
        },
      ]
      await db.server`select private.session_add_items(${a}, ${session}, ${json(items)})`
      await attempt(session, 'q1', { verdict: 'correct' })

      const deleted = await as(db, A(), (tx) => tx`delete from public.skills where id = ${skill} returning id`)
      assert.equal(deleted.length, 0, 'the skill with evidence must survive')
      const hidden = await as(
        db,
        A(),
        (tx) => tx`update public.skills set status = 'hidden' where id = ${skill} returning id`,
      )
      assert.equal(hidden.length, 1)
      const gone = await as(db, A(), (tx) => tx`delete from public.skills where id = ${unused} returning id`)
      assert.equal(gone.length, 1, 'a skill without evidence can still be deleted')
      const [{ n }] = await db.admin`select count(*)::int as n from public.session_events where skill_id = ${skill}`
      assert.equal(n, 1)
    })

    test('students cannot forge, edit or delete study-session evidence', async () => {
      const session = await startSession()
      await addQuestion(session)
      const event = await attempt(session, 'q1', { verdict: 'incorrect' })
      assert.equal(
        await errorCode(() =>
          as(
            db,
            A(),
            (
              tx,
            ) => tx`insert into public.session_events (user_id, study_session_id, skill_id, verdict, correct, attempt_mode)
            values (${a}, ${session}, ${skillA}, 'correct', true, 'independent')`,
          ),
        ),
        '42501',
      )
      assert.equal(
        await errorCode(() =>
          as(
            db,
            A(),
            (tx) => tx`insert into public.session_events (user_id, skill_id, correct, attempt_mode, verdict)
            values (${a}, ${skillA}, true, 'independent', 'correct')`,
          ),
        ),
        '42501',
      )
      const updated = await as(
        db,
        A(),
        (tx) => tx`update public.session_events set verdict = 'correct', correct = true
        where id = ${event} returning id`,
      )
      assert.equal(updated.length, 0)
      const deleted = await as(db, A(), (tx) => tx`delete from public.session_events where id = ${event} returning id`)
      assert.equal(deleted.length, 0)
      const [row] = await db.admin`select verdict from public.session_events where id = ${event}`
      assert.equal(row.verdict, 'incorrect')
    })

    test('lesson check-ins from the current app keep working', async () => {
      const [lesson] = await as(
        db,
        A(),
        (tx) => tx`insert into public.courses (user_id, title, status) values (${a}, 'L', 'ready') returning id`,
      )
      const inserted = await as(
        db,
        A(),
        (tx) => tx`insert into public.session_events (user_id, course_id, segment_index, question, answer, correct)
        values (${a}, ${lesson.id}, 0, 'q', 'a', true) returning id`,
      )
      assert.equal(inserted.length, 1)
      const theirs = await as(db, B(), (tx) => tx`select id from public.session_events where course_id = ${lesson.id}`)
      assert.equal(theirs.length, 0)
    })
  })

  describe('materials and the skill map', () => {
    test('students name and file materials; only the server sets the file, its size and its status', async () => {
      const [m] = await as(
        db,
        A(),
        (tx) => tx`insert into public.materials (kind, title, declared_bytes, academy_course_id)
        values ('pdf', 'Lecture 7', 1024, ${courseA}) returning id, status, storage_key, user_id`,
      )
      assert.equal(m.status, 'pending')
      assert.equal(m.storage_key, null)
      assert.equal(m.user_id, a)
      assert.equal(
        await errorCode(() =>
          as(
            db,
            A(),
            (tx) => tx`insert into public.materials (kind, title, storage_key) values ('pdf', 'x', 'materials/x')`,
          ),
        ),
        '42501',
      )
      assert.equal(
        await errorCode(() =>
          as(db, A(), (tx) => tx`insert into public.materials (user_id, kind, title) values (${b}, 'pdf', 'x')`),
        ),
        '42501',
      )
      assert.equal(
        await errorCode(() =>
          as(db, A(), (tx) => tx`update public.materials set status = 'mapped' where id = ${m.id}`),
        ),
        '42501',
      )
      assert.equal(
        await errorCode(() => as(db, A(), (tx) => tx`update public.materials set text = 'forged' where id = ${m.id}`)),
        '42501',
      )
      assert.equal(
        await errorCode(() => as(db, A(), (tx) => tx`delete from public.materials where id = ${m.id}`)),
        '42501',
      )
      const renamed = await as(
        db,
        A(),
        (tx) => tx`update public.materials set title = 'Lecture 7: Bayes' where id = ${m.id} returning id`,
      )
      assert.equal(renamed.length, 1)

      assert.equal((await as(db, B(), (tx) => tx`select id from public.materials where id = ${m.id}`)).length, 0)
      assert.equal(
        (await as(db, B(), (tx) => tx`update public.materials set title = 'x' where id = ${m.id} returning id`)).length,
        0,
      )
      assert.equal(
        await errorCode(() =>
          as(
            db,
            B(),
            (tx) => tx`insert into public.materials (kind, title, academy_course_id) values ('pdf', 'x', ${courseA})`,
          ),
        ),
        '42501',
      )

      assert.equal(
        await errorCode(() => db.server`select private.material_accept_upload(${b}, ${m.id}, 1024)`),
        '42501',
      )
      const [{ key }] = await db.server`select private.material_accept_upload(${a}, ${m.id}, 1024) as key`
      assert.equal(key, `materials/${a}/${m.id}`)
      assert.equal(
        await errorCode(() => db.server`select private.material_accept_upload(${a}, ${m.id}, 1024)`),
        '42501',
      )
      const [{ forgotten }] = await db.server`select private.material_forget(${a}, ${m.id}) as forgotten`
      assert.equal(forgotten, key)
    })

    test('a storage key always names its owner and its row', async () => {
      const [m] =
        await db.admin`insert into public.materials (user_id, kind, title) values (${a}, 'pdf', 'x') returning id`
      assert.equal(
        await errorCode(
          () => db.admin`update public.materials set storage_key = ${`materials/${b}/${m.id}`} where id = ${m.id}`,
        ),
        '23514',
      )
    })

    test('the skill map stays inside the student’s own course', async () => {
      assert.equal(
        await errorCode(() =>
          as(db, A(), (tx) => tx`insert into public.skills (academy_course_id, name) values (${courseB}, 'x')`),
        ),
        '42501',
      )
      assert.equal(
        await errorCode(() =>
          as(
            db,
            A(),
            (tx) => tx`update public.skills set status = 'merged', merged_into = ${skillB} where id = ${skillA2}`,
          ),
        ),
        '23503',
        "merging into another student's skill must fail",
      )
      assert.equal(
        await errorCode(() =>
          as(
            db,
            A(),
            (tx) =>
              tx`insert into public.skills (academy_course_id, name) values (${courseA}, ' conditional PROBABILITY')`,
          ),
        ),
        '23505',
      )
      const [src] = await as(
        db,
        A(),
        (tx) => tx`insert into public.skill_sources (skill_id, lesson_id, origin, locator)
        select ${skillA}, id, 'inferred', '{"part": 1}' from public.courses where user_id = ${a} limit 1 returning id`,
      )
      assert.ok(src.id)
      const [lessonB] = await as(
        db,
        B(),
        (tx) => tx`insert into public.courses (user_id, title) values (${b}, 'B lesson') returning id`,
      )
      assert.equal(
        await errorCode(() =>
          as(
            db,
            B(),
            (tx) => tx`insert into public.skill_sources (skill_id, lesson_id, origin)
          values (${skillA}, ${lessonB.id}, 'student')`,
          ),
        ),
        '42501',
        "a source can't be attached to another student's skill",
      )
    })
  })

  describe('account deletion', () => {
    test('needs a recent sign-in, and visitors and the server cannot call it', async () => {
      assert.equal(
        await errorCode(() =>
          as(
            db,
            { role: 'authenticated', sub: a, signedInSecondsAgo: 3600 },
            (tx) => tx`select public.delete_my_account()`,
          ),
        ),
        'LY010',
      )
      assert.equal(
        await errorCode(() => as(db, { role: 'anon' }, (tx) => tx`select public.delete_my_account()`)),
        '42501',
      )
      assert.equal(await errorCode(() => db.server`select public.delete_my_account()`), '42501')
    })

    test("deletes everything of the student's and nothing of anyone else's", async () => {
      const doomed = await makeUser(db, 'doomed@test.lyceo')
      const D = { role: 'authenticated' as const, sub: doomed }
      const [course] = await as(
        db,
        D,
        (tx) => tx`insert into public.academy_courses (name) values ('Bio') returning id`,
      )
      const [skill] = await as(
        db,
        D,
        (tx) => tx`insert into public.skills (academy_course_id, name) values (${course.id}, 'Mitosis') returning id`,
      )
      await as(db, D, (tx) => tx`insert into public.materials (kind, title) values ('pdf', 'Lecture')`)
      await as(
        db,
        D,
        (tx) =>
          tx`insert into public.deadlines (course_id, title, due_on) values (${course.id}, 'Midterm', '2030-01-01')`,
      )
      const [lesson] = await as(
        db,
        D,
        (tx) => tx`insert into public.courses (user_id, title) values (${doomed}, 'L') returning id`,
      )
      await as(
        db,
        D,
        (tx) =>
          tx`insert into public.session_events (user_id, course_id, segment_index, correct) values (${doomed}, ${lesson.id}, 0, true)`,
      )
      const [{ id: session }] =
        await db.server`select private.session_start(${doomed}, ${course.id}, 'quick_check', ${[skill.id]}, 'v1') as id`
      await db.server`select private.session_add_items(${doomed}, ${session}, ${json([
        {
          id: 'q1',
          skill_id: skill.id,
          difficulty: 1,
          facet: 'conceptual',
          public: { prompt: 'x' },
          key: { accepted: ['y'] },
        },
      ])})`
      await db.server`select private.record_attempt(${doomed}, ${session}, 'q1', ${json({ verdict: 'correct', answer: 'y' })})`
      const [{ id: usage }] =
        await db.server`select private.usage_reserve(${doomed}, 'lesson', 'anthropic', 'm', 0.01, 'v') as id`
      await db.server`select private.usage_settle(${usage}, true, 0.004)`

      const othersBefore = await countRowsNotOwnedBy(doomed)
      await as(db, D, (tx) => tx`select public.delete_my_account()`)

      for (const [table, column] of [
        ['public.users', 'id'],
        ['public.academy_courses', 'user_id'],
        ['public.deadlines', 'user_id'],
        ['public.courses', 'user_id'],
        ['public.session_events', 'user_id'],
        ['public.materials', 'user_id'],
        ['public.skills', 'user_id'],
        ['public.study_sessions', 'user_id'],
        ['private.item_keys', 'user_id'],
        ['private.ai_usage', 'user_id'],
        ['auth.users', 'id'],
      ]) {
        const [{ n }] = await db.admin.unsafe(`select count(*)::int as n from ${table} where ${column} = $1`, [doomed])
        assert.equal(n, 0, `${table} still has rows`)
      }
      const [kept] = await db.admin`select user_id, cost_usd::float as cost from private.ai_usage where id = ${usage}`
      assert.deepEqual(kept, { user_id: null, cost: 0.004 }, 'cost records stay, without the student')
      assert.deepEqual(await countRowsNotOwnedBy(doomed), othersBefore)

      const pending = await db.server`select * from private.account_deletions_pending(10) as user_id`
      assert.ok(pending.some((r) => r.user_id === doomed))
      await db.server`select private.account_files_deleted(${doomed})`
      const after = await db.server`select * from private.account_deletions_pending(10) as user_id`
      assert.ok(!after.some((r) => r.user_id === doomed))
    })
  })

  test("an answer is saved before the app has written the student's profile row", async () => {
    // A student who reaches a study session without opening the dashboard has no public.users row (see 0005).
    const [{ id: fresh }] = await db.admin`insert into auth.users (email) values ('fresh@test.lyceo') returning id`
    const F = { role: 'authenticated' as const, sub: fresh as string }
    const [course] = await as(db, F, (tx) => tx`insert into public.academy_courses (name) values ('Chem') returning id`)
    const [skill] = await as(
      db,
      F,
      (tx) => tx`insert into public.skills (academy_course_id, name) values (${course.id}, 'Moles') returning id`,
    )
    const [{ id: session }] =
      await db.server`select private.session_start(${fresh}, ${course.id}, 'quick_check', ${[skill.id]}, 'v1') as id`
    await db.server`select private.session_add_items(${fresh}, ${session}, ${json([
      {
        id: 'q1',
        skill_id: skill.id,
        difficulty: 1,
        facet: 'conceptual',
        public: { prompt: 'x' },
        key: { accepted: ['y'] },
      },
    ])})`
    const [{ id }] =
      await db.server`select private.record_attempt(${fresh}, ${session}, 'q1', ${json({ verdict: 'correct', answer: 'y' })}) as id`
    assert.ok(Number(id) > 0, 'the answer was recorded')
    const [profile] = await db.admin`select email from public.users where id = ${fresh}`
    assert.equal(profile?.email, 'fresh@test.lyceo', 'the profile row was created with the email')
  })
})

async function spent(user: string) {
  const [row] =
    await db.admin`select coalesce(sum(spent_usd), 0)::float as s from private.usage_days where bucket = ${user}`
  return row.s as number
}
async function reservedAndSpent(user: string) {
  const [row] =
    await db.admin`select coalesce(sum(spent_usd + reserved_usd), 0)::float as s from private.usage_days where bucket = ${user}`
  return row.s as number
}
const round = (n: number) => Math.round(n * 1e6) / 1e6
async function countRowsNotOwnedBy(user: string) {
  const counts: Record<string, number> = {}
  for (const table of ['academy_courses', 'courses', 'session_events', 'skills', 'materials', 'study_sessions']) {
    const [{ n }] = await db.admin.unsafe(`select count(*)::int as n from public.${table} where user_id <> $1`, [user])
    counts[table] = n
  }
  return counts
}
