// The server's TypeScript modules against the real schema, logging in as lyceo_server exactly as production would.
// Private uploads use an in-memory bucket here; scripts/check-staging.mjs runs the same checks against real R2.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { as, createTestDb, makeUser, skipReason, type TestDb } from './harness'
import type { MaterialStore } from '../../app/lib/server/materials'

let db: TestDb
let a: string
let b: string
let course: number
let skill: number

type Modules = {
  budget: typeof import('../../app/lib/server/budget')
  records: typeof import('../../app/lib/server/records')
  materials: typeof import('../../app/lib/server/materials')
  trusted: typeof import('../../app/lib/server/trusted-db')
}
let m: Modules

/** A bucket in memory, with the same contract as R2 for the operations Lyceo uses. */
function memoryStore() {
  const objects = new Map<string, { body: Uint8Array; contentType: string | null }>()
  const signed: { key: string; contentType: string; bytes: number; expiresIn: number }[] = []
  const store: MaterialStore = {
    presignPut: async (key, contentType, bytes, expiresIn) => {
      signed.push({ key, contentType, bytes, expiresIn })
      return `https://r2.test/${key}?signed`
    },
    head: async (key) => {
      const o = objects.get(key)
      return o ? { bytes: o.body.length, contentType: o.contentType } : null
    },
    readStart: async (key, bytes) => objects.get(key)!.body.slice(0, bytes),
    read: async (key) => objects.get(key)!.body,
    copy: async (from, to) => {
      objects.set(to, { ...objects.get(from)! })
    },
    remove: async (key) => {
      objects.delete(key)
    },
    removePrefix: async (prefix) => {
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix))
      keys.forEach((k) => objects.delete(k))
      return keys.length
    },
  }
  const put = (key: string, body: Uint8Array, contentType: string) => objects.set(key, { body, contentType })
  return { store, objects, signed, put }
}

const pdf = (size = 2048) => {
  const body = new Uint8Array(size)
  body.set(new TextEncoder().encode('%PDF-1.7\n'))
  return body
}

describe('server modules against the staging schema', { skip: skipReason }, () => {
  before(async () => {
    db = await createTestDb()
    process.env.LYCEO_SERVER_DATABASE_URL = db.serverUrl
    process.env.LYCEO_USAGE_LOG = 'off'
    m = {
      budget: await import('../../app/lib/server/budget'),
      records: await import('../../app/lib/server/records'),
      materials: await import('../../app/lib/server/materials'),
      trusted: await import('../../app/lib/server/trusted-db'),
    }
    a = await makeUser(db, 'a@test.lyceo')
    b = await makeUser(db, 'b@test.lyceo')
    ;[{ id: course }] = await as(
      db,
      { role: 'authenticated', sub: a },
      (tx) => tx`insert into public.academy_courses (name) values ('Stat 161') returning id`,
    )
    ;[{ id: skill }] = await as(
      db,
      { role: 'authenticated', sub: a },
      (tx) => tx`insert into public.skills (academy_course_id, name) values (${course}, 'Variance') returning id`,
    )
    course = Number(course)
    skill = Number(skill)
  })
  after(async () => {
    await m?.trusted.closeTrustedDb()
    delete process.env.LYCEO_SERVER_DATABASE_URL
    await db?.close()
  })

  test('usage: reserve, settle, and a friendly 429 at the daily limit', async () => {
    const r = await m.budget.reserveUsage({
      task: 'lesson',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      userId: a,
      estimateUsd: 0.12,
    })
    assert.ok(r && r.id > 0)
    await m.budget.settleUsage(r, {
      ok: true,
      costUsd: 0.0371,
      tokens: { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 },
      latencyMs: 900,
    })
    const [row] =
      await db.admin`select status, cost_usd::float as cost, price_version from private.ai_usage where id = ${r!.id}`
    assert.deepEqual(row, { status: 'settled', cost: 0.0371, price_version: '2026-11-22' })

    await db.admin`update private.usage_limits set daily_usd = 0.05 where scope = 'student'`
    try {
      await assert.rejects(
        m.budget.reserveUsage({
          task: 'lesson',
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          userId: a,
          estimateUsd: 0.12,
        }),
        (err: { status: number; reason: string; message: string }) =>
          err.status === 429 && err.reason === 'daily' && /resets at midnight UTC/.test(err.message),
      )
    } finally {
      await db.admin`update private.usage_limits set daily_usd = 1.50 where scope = 'student'`
    }
  })

  test('estimates run high on purpose', () => {
    const est = m.budget.estimateClaudeUsd('claude-sonnet-4-6', 30_000, 8000)
    assert.ok(est >= (10_000 * 3 + 8000 * 15) / 1e6, `${est}`)
    assert.ok(m.budget.estimateTranscriptionUsd('whisper-1', 25 * 1024 * 1024) >= 0.6)
  })

  test("study records: only the owner's session, and keys stay server-side", async () => {
    const session = await m.records.startSession(a, course, 'quick_check', [skill], 'v1')
    await m.records.addItems(a, session, [
      {
        id: 'q1',
        type: 'question',
        skillId: skill,
        difficulty: 2,
        facet: 'procedural',
        prompt: 'Var(X) for a Bernoulli(0.3)?',
        format: 'number',
        key: { accepted: ['0.21'], solution: '0.3 × 0.7' },
      },
    ])
    const [visible] = await as(
      db,
      { role: 'authenticated', sub: a },
      (tx) => tx`select items from public.study_sessions where id = ${session}`,
    )
    assert.ok(!JSON.stringify(visible.items).includes('0.21'))

    const forGrading = await m.records.itemForGrading(a, session, 'q1')
    assert.deepEqual(forGrading.key.accepted, ['0.21'])
    await assert.rejects(m.records.itemForGrading(b, session, 'q1'), (err: { status: number }) => err.status === 404)
    await assert.rejects(m.records.addItems(b, session, []), (err: { status: number }) => err.status === 404)

    const event = await m.records.recordAttempt(a, session, 'q1', {
      answer: '0.21',
      verdict: 'correct',
      grader: 'rule',
      graderVersion: 'grade-v2.0/rules',
    })
    const [row] =
      await db.admin`select attempt_mode, verdict, grader_version from public.session_events where id = ${event}`
    assert.deepEqual(row, { attempt_mode: 'independent', verdict: 'correct', grader_version: 'grade-v2.0/rules' })
    // A second answer to the same question is refused as a conflict, not recorded twice.
    await assert.rejects(
      m.records.recordAttempt(a, session, 'q1', {
        answer: '0.21',
        verdict: 'correct',
        grader: 'rule',
        graderVersion: 'x',
      }),
      (err: { status: number }) => err.status === 409,
    )

    // Hints come from the key one at a time, and the answer after one is assisted.
    await m.records.addItems(a, session, [
      {
        id: 'q2',
        type: 'question',
        skillId: skill,
        difficulty: 1,
        facet: 'procedural',
        prompt: 'E(X) for a Bernoulli(0.3)?',
        format: 'number',
        key: { accepted: ['0.3'], solution: 'p', hints: ['A Bernoulli takes the values 0 and 1.'] },
      },
    ])
    assert.deepEqual(await m.records.revealHint(a, session, 'q2'), {
      hint: 'A Bernoulli takes the values 0 and 1.',
      shown: 1,
      remaining: 0,
    })
    assert.equal((await m.records.itemForGrading(a, session, 'q2')).hintsRevealed, 1)
    await assert.rejects(m.records.revealHint(b, session, 'q2'), (err: { status: number }) => err.status === 404)
    const hinted = await m.records.recordAttempt(a, session, 'q2', {
      answer: '0.3',
      verdict: 'correct',
      grader: 'rule',
      graderVersion: 'grade-v2.0/rules',
    })
    const [assisted] = await db.admin`select attempt_mode, hints_used from public.session_events where id = ${hinted}`
    assert.deepEqual(assisted, { attempt_mode: 'assisted', hints_used: 1 })

    await m.records.touchSession(a, session, 240)
    await m.records.finishSession(a, session, 'completed', { today: 'ok' }, 300)
    const [closed] = await db.admin`select status, active_seconds from public.study_sessions where id = ${session}`
    assert.deepEqual(closed, { status: 'completed', active_seconds: 300 })
    await assert.rejects(
      m.records.finishSession(a, session, 'completed', {}),
      (err: { status: number }) => err.status === 404,
    )
  })

  test('private uploads: exact signed upload, validation before acceptance, deletion of both copies', async () => {
    const mem = memoryStore()
    m.materials.setMaterialStoreForTests(mem.store)
    try {
      assert.equal(m.materials.privateUploadsEnabled(), true)
      assert.match(m.materials.checkDeclaredFile('application/x-msdownload', 10) ?? '', /PDF or an audio/)
      assert.match(m.materials.checkDeclaredFile('audio/mpeg', 30 * 1024 * 1024) ?? '', /under 25 MB/)

      const make = async () => {
        const [row] = await as(
          db,
          { role: 'authenticated', sub: a },
          (tx) =>
            tx`insert into public.materials (kind, title, declared_bytes) values ('pdf', 'Lecture', 2048) returning id`,
        )
        return Number(row.id)
      }

      // A good PDF.
      const good = await make()
      const upload = await m.materials.prepareUpload(a, good, 'application/pdf', 2048)
      assert.deepEqual(mem.signed.at(-1), {
        key: `incoming/${a}/${good}`,
        contentType: 'application/pdf',
        bytes: 2048,
        expiresIn: 600,
      })
      assert.deepEqual(upload.headers, { 'Content-Type': 'application/pdf' })
      mem.put(`incoming/${a}/${good}`, pdf(), 'application/pdf')
      const check = await m.materials.finishUpload(a, good, 2048)
      assert.deepEqual(check, { ok: true, key: `materials/${a}/${good}`, bytes: 2048, kind: 'pdf' })
      assert.equal(await m.records.acceptUpload(a, good, 2048), `materials/${a}/${good}`)
      assert.ok(!mem.objects.has(`incoming/${a}/${good}`) && mem.objects.has(`materials/${a}/${good}`))
      assert.deepEqual(await m.materials.finishUpload(a, good, 2048), check, 'finishing twice is safe')
      await assert.rejects(m.materials.readMaterialFile(b, `materials/${a}/${good}`))

      // An executable renamed to .pdf, and a file that grew after it was declared.
      const fake = await make()
      mem.put(`incoming/${a}/${fake}`, new TextEncoder().encode('MZ\x90\x00 this is not a pdf'), 'application/pdf')
      const rejected = await m.materials.finishUpload(a, fake, null)
      assert.equal(rejected.ok, false)
      assert.ok(!mem.objects.has(`incoming/${a}/${fake}`), 'a rejected file is deleted')
      const grown = await make()
      mem.put(`incoming/${a}/${grown}`, pdf(4096), 'application/pdf')
      assert.equal((await m.materials.finishUpload(a, grown, 2048)).ok, false)

      // Deletion removes the file, then the row; another student can't do either.
      await assert.rejects(m.records.forgetMaterial(b, good), (err: { status: number }) => err.status === 404)
      await m.materials.deleteMaterialFiles(a, good)
      await m.records.forgetMaterial(a, good)
      assert.ok(!mem.objects.has(`materials/${a}/${good}`))
      assert.equal((await db.admin`select id from public.materials where id = ${good}`).length, 0)

      // Account deletion: everything under the student's prefixes, nothing else.
      mem.put(`materials/${a}/900`, pdf(), 'application/pdf')
      mem.put(`incoming/${a}/901`, pdf(), 'application/pdf')
      mem.put(`materials/${b}/902`, pdf(), 'application/pdf')
      assert.equal(await m.materials.deleteAllFilesOf(a), 2)
      assert.ok(mem.objects.has(`materials/${b}/902`))
    } finally {
      m.materials.setMaterialStoreForTests(undefined)
    }
  })
})
