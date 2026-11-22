/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { DEMO_LESSON } from '../app/lib/demo-lesson'
import { normalizeLesson } from '../app/lib/lesson'
import { renderBoardLine } from '../app/lib/math'
import { gradeAnswer, writeLesson } from '../app/lib/server/ai'
import { loadLearner, paceFrom } from '../app/lib/server/learner'
import { cacheKey, signText, verifyText } from '../app/lib/server/tts'
import { onUsage, type UsageRecord } from '../app/lib/server/usage'

process.env.LYCEO_USAGE_LOG = 'off'
// Unit tests never reach a database, whatever the environment says (CI sets a fake one for its bundle scan). Daily
// limits are tested against a real Postgres in tests/db.
delete process.env.LYCEO_SERVER_DATABASE_URL

test('legacy StudyAI lessons and v2 lessons both open', () => {
  const legacy = normalizeLesson({
    titulo: 'Grupos',
    duracion_estimada: '6 minutos',
    segmentos: [
      { concepto: 'Grupo', narracion: 'Un grupo es...', pizarra: 'G \\times G \\to G', pregunta_check: '¿Qué es?' },
      { concepto: 'Sub', narracion: 'Un subgrupo...', pizarra: 'H es subgrupo\nsi es cerrado', pregunta_check: '' },
    ],
  })!
  assert.equal(legacy.title, 'Grupos')
  assert.equal(legacy.estimatedMinutes, 6)
  assert.deepEqual(legacy.segments[0].board, ['$$G \\times G \\to G$$'])
  assert.deepEqual(legacy.segments[1].board, ['H es subgrupo', 'si es cerrado'])
  assert.equal(normalizeLesson(null), null)
  assert.equal(normalizeLesson({ segments: [] }), null)
  assert.equal(normalizeLesson(DEMO_LESSON)!.segments.length, 5)
})

test('the board escapes text and renders the demo lesson without KaTeX errors', () => {
  const html = renderBoardLine('<b>x</b> and $x^2$ and $$\\frac{1}{2}$$')
  assert.ok(html.includes('&lt;b&gt;') && html.includes('katex') && html.includes('katex-display'))
  for (const s of DEMO_LESSON.segments)
    for (const l of s.board) assert.ok(!renderBoardLine(l).includes('katex-error'), l)
})

test('speech URLs are signed so the voice endpoint cannot read arbitrary text', () => {
  const sig = signText('hello')
  assert.ok(verifyText('hello', sig))
  assert.ok(!verifyText('hello!', sig))
  assert.ok(!verifyText('hello', null))
  assert.notEqual(cacheKey('a'), cacheKey('b'))
})

test('learner model from Supabase rows', async () => {
  const lessonA = {
    title: 'Stats',
    estimatedMinutes: 5,
    segments: ['Mean', 'Variance', 'SE'].map((c) => ({
      concept: c,
      narration: 'n',
      board: [],
      check: { question: 'q', idealAnswer: 'a' },
    })),
  }
  const tables: Record<string, unknown[]> = {
    users: [{ career: 'Ciencias de la Computación', learning_style: 'visual' }],
    session_events: [
      { course_id: 1, segment_index: 0, correct: true, time_to_answer_seconds: 10, created_at: '2026-11-01T00:00:00Z' },
      {
        course_id: 1,
        segment_index: 1,
        correct: false,
        time_to_answer_seconds: 30,
        created_at: '2026-11-01T00:01:00Z',
      },
      { course_id: 1, segment_index: 1, correct: true, time_to_answer_seconds: 20, created_at: '2026-11-01T00:02:00Z' },
      {
        course_id: 1,
        segment_index: 2,
        correct: false,
        time_to_answer_seconds: null,
        created_at: '2026-11-01T00:03:00Z',
      },
      { course_id: 99, segment_index: 0, correct: true, time_to_answer_seconds: 5, created_at: '2026-11-01T00:04:00Z' },
    ],
    courses: [{ id: 1, title: 'Stats', script: lessonA }],
  }
  const q = (rows: unknown[]) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      then: (r: any) => r({ data: rows }),
    }
    return b
  }
  const db: any = { from: (t: string) => q(tables[t]) }
  const l = await loadLearner(db, 'u1')
  assert.equal(l.major, 'Computer Science')
  assert.equal(l.styleId, 'visual')
  assert.equal(l.conceptsSeen, 3)
  assert.equal(l.firstTryAccuracy, 1 / 3)
  assert.deepEqual(l.needsReview.map((c) => c.concept).sort(), ['SE', 'Variance'])
  assert.equal(l.avgSecondsToAnswer, 16)
  assert.equal(paceFrom(0.4, 10), 'gentle')
  assert.equal(paceFrom(0.9, 10), 'brisk')
  assert.equal(paceFrom(0.9, 2), 'steady')
})

// Claude calls: a fake fetch captures the request the SDK sends and returns a canned answer.
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function fakeClaude(answers: unknown[], usage = { input_tokens: 1200, output_tokens: 300 }) {
  const requests: any[] = []
  globalThis.fetch = (async (_url: unknown, init: any) => {
    const body = JSON.parse(init.body)
    requests.push(body)
    const obj = answers[Math.min(requests.length - 1, answers.length - 1)]
    const useTool = (body.tools ?? []).length > 0
    const content = useTool
      ? [{ type: 'tool_use', id: 't1', name: body.tools[0].name, input: obj }]
      : [{ type: 'text', text: JSON.stringify(obj) }]
    return new Response(
      JSON.stringify({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content,
        stop_reason: useTool ? 'tool_use' : 'end_turn',
        usage,
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  return requests
}

test('writeLesson: personalization, truncation and a usage record per call', async () => {
  process.env.ANTHROPIC_API_KEY = 'test'
  const records: UsageRecord[] = []
  const stop = onUsage((r) => records.push(r))
  const requests = fakeClaude([
    {
      title: 'Means',
      estimatedMinutes: 4,
      segments: [
        {
          concept: 'Mean',
          narration: 'The mean is...',
          board: [' $\\bar x$ ', ''],
          check: { question: 'What?', idealAnswer: 'avg' },
        },
      ],
    },
  ])
  const lesson = await writeLesson({
    courseTitle: 'Stat 161',
    material: 'x'.repeat(100_000),
    student: { styleId: 'codigo', major: 'Computer Science', pace: 'gentle', focusConcepts: ['Variance'] },
    userId: 'user-123',
  })
  stop()
  assert.deepEqual(lesson.segments[0].board, ['$\\bar x$'])
  const prompt = JSON.stringify(requests[0].messages)
  assert.ok(prompt.includes('Computer Science') && prompt.includes('pseudo-code') && prompt.includes('Variance'))
  assert.ok(prompt.includes('smaller steps'))
  assert.ok(prompt.length < 90_000, 'material is truncated')
  assert.equal(requests[0].model, 'claude-sonnet-4-6')

  assert.equal(records.length, 1)
  const r = records[0]
  assert.equal(r.task, 'lesson')
  assert.equal(r.model, 'claude-sonnet-4-6')
  assert.equal(r.ok, true)
  assert.equal(r.tokens?.inputTokens, 1200)
  assert.equal(r.tokens?.outputTokens, 300)
  assert.equal(r.costUsd, (1200 * 3 + 300 * 15) / 1e6)
  assert.ok(r.user && r.user !== 'user-123', 'the user id is hashed')
})

test('gradeAnswer: model override, dropped re-explanation when correct, failure is logged', async () => {
  process.env.ANTHROPIC_API_KEY = 'test'
  const records: UsageRecord[] = []
  const stop = onUsage((r) => records.push(r))
  const requests = fakeClaude([
    {
      correct: false,
      feedback: 'Close!',
      reexplanation: 'Think of it as...',
      reexplanationBoard: ['a', 'b', 'c', 'd', 'e'],
    },
    { correct: true, feedback: 'Yes', reexplanation: 'should be dropped', reexplanationBoard: ['x'] },
  ])
  const g = await gradeAnswer({
    segment: DEMO_LESSON.segments[0],
    answer: '10/200',
    styleId: 'analogias',
    missedBefore: 1,
    model: 'claude-haiku-5-5',
  })
  assert.equal(g.reexplanationBoard.length, 4)
  assert.ok(JSON.stringify(requests[0]).includes('already missed this question 1 time'))
  assert.equal(requests[0].model, 'claude-haiku-5-5')
  const g2 = await gradeAnswer({ segment: DEMO_LESSON.segments[0], answer: '0.25', styleId: null, missedBefore: 0 })
  assert.equal(g2.reexplanation, '')
  assert.deepEqual(g2.reexplanationBoard, [])

  globalThis.fetch = (async () => new Response('{"type":"error"}', { status: 500 })) as typeof fetch
  await assert.rejects(gradeAnswer({ segment: DEMO_LESSON.segments[0], answer: 'x', styleId: null, missedBefore: 0 }))
  stop()
  assert.deepEqual(
    records.map((r) => [r.task, r.model, r.ok]),
    [
      ['grade', 'claude-haiku-5-5', true],
      ['grade', 'claude-sonnet-4-6', true],
      ['grade', 'claude-sonnet-4-6', false],
    ],
  )
  assert.equal(records[0].costUsd, (1200 * 0.1 + 300 * 0.5) / 1e6)
  assert.equal(records[2].costUsd, null)
})
