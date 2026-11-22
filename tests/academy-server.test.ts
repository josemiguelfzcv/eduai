/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCourseDetail, buildSnapshot, loadAcademyData, SETUP_MESSAGE } from '../app/lib/server/academy'

const seg = (concept: string, q = true) => ({
  concept,
  narration: 'n',
  board: ['b'],
  check: { question: q ? 'q?' : '', idealAnswer: 'a' },
})
const script = (title: string, concepts: string[], minutes: number, meta?: object) => ({
  title,
  estimatedMinutes: minutes,
  segments: concepts.map((c) => seg(c)),
  meta,
})

const tables: Record<string, unknown[]> = {
  academy_courses: [
    { id: 1, name: 'Statistics 201', code: 'STAT 201', term: 'Fall 2026', created_at: '2026-09-02T00:00:00Z' },
    { id: 2, name: 'Data Structures', code: 'CS 136', term: 'Fall 2026', created_at: '2026-09-03T00:00:00Z' },
    { id: 3, name: 'Microeconomics', code: 'ECON 110', term: 'Fall 2026', created_at: '2026-09-04T00:00:00Z' },
    { id: 4, name: 'Linear Algebra', code: 'MATH 250', term: 'Fall 2026', created_at: '2026-09-05T00:00:00Z' },
  ],
  deadlines: [
    {
      id: 1,
      course_id: 1,
      title: 'Midterm 2',
      kind: 'exam',
      due_on: '2026-11-20',
      topics: 'Sampling distributions, standard error, CLT',
      completed_at: null,
    },
    {
      id: 2,
      course_id: 2,
      title: 'Problem set 7',
      kind: 'assignment',
      due_on: '2026-11-21',
      topics: null,
      completed_at: null,
    },
    {
      id: 3,
      course_id: 4,
      title: 'Exam 2',
      kind: 'exam',
      due_on: '2026-11-24',
      topics: 'Eigenvalues',
      completed_at: null,
    },
    { id: 4, course_id: 3, title: 'Quiz 4', kind: 'quiz', due_on: '2026-12-02', topics: null, completed_at: null },
    {
      id: 5,
      course_id: 1,
      title: 'Problem set 6',
      kind: 'assignment',
      due_on: '2026-11-12',
      topics: null,
      completed_at: '2026-11-12T10:00:00Z',
    },
  ],
  courses: [
    {
      id: 10,
      title: 'Stat week 9',
      created_at: '2026-11-10T10:00:00Z',
      academy_course_id: 1,
      script: script(
        'Sampling distributions and the standard error',
        ['Sampling distribution', 'Standard error', 'Why n matters', 'Central limit theorem', 'Confidence intervals'],
        9,
      ),
    },
    {
      id: 11,
      title: 'CS lecture 18',
      created_at: '2026-11-12T10:00:00Z',
      academy_course_id: 2,
      script: script('Binary search trees', ['BST property', 'Insertion', 'Deletion', 'Balancing', 'Traversals'], 10),
    },
    {
      id: 12,
      title: 'Econ ch 5',
      created_at: '2026-11-01T10:00:00Z',
      academy_course_id: 3,
      script: script('Price elasticity of demand', ['Elasticity', 'Total revenue', 'Determinants'], 6),
    },
    {
      id: 13,
      title: 'Bayes',
      created_at: '2026-10-20T10:00:00Z',
      academy_course_id: null,
      script: script("Bayes' theorem", ['Conditional probability', "Bayes' theorem", 'Base rates'], 6),
    },
    { id: 14, title: 'Failed upload', created_at: '2026-10-21T10:00:00Z', academy_course_id: null, script: null },
  ],
  session_events: [
    ['2026-11-14T10:00:00Z', 10, 0, true],
    ['2026-11-14T10:02:00Z', 10, 1, false],
    ['2026-11-14T10:03:00Z', 10, 1, true],
    ['2026-11-14T10:05:00Z', 10, 2, false],
    ['2026-11-14T10:07:00Z', 10, 3, true],
    ['2026-11-14T10:09:00Z', 10, 4, true],
    ['2026-11-16T09:00:00Z', 11, 0, true],
    ['2026-11-16T09:03:00Z', 11, 1, true],
    ['2026-10-20T11:00:00Z', 13, 0, true],
    ['2026-10-20T11:03:00Z', 13, 1, true],
    ['2026-10-20T11:05:00Z', 13, 2, true],
  ].map(([created_at, course_id, segment_index, correct]) => ({
    created_at,
    course_id,
    segment_index,
    correct,
    time_to_answer_seconds: 20,
  })),
  users: [{ career: 'Computer Science', learning_style: 'analogias' }],
}

function fakeDb(broken?: string) {
  return {
    from(table: string) {
      const result =
        broken === table
          ? { data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } }
          : { data: tables[table], error: null }
      const b: any = {
        select: () => b,
        eq: () => b,
        is: () => b,
        order: () => b,
        limit: () => b,
        in: () => b,
        maybeSingle: async () => ({ data: (result.data as unknown[] | null)?.[0] ?? null, error: result.error }),
        then: (resolve: (v: unknown) => void) => resolve(result),
      }
      return b
    },
  } as any
}

const today = '2026-11-17'

test('My Academy snapshot from Supabase rows', async () => {
  const data = await loadAcademyData(fakeDb(), 'u1')
  const snap = buildSnapshot(data, today)
  assert.equal(snap.courses.length, 4)
  assert.deepEqual(
    snap.unsorted.map((l) => l.id),
    [13],
  )
  assert.ok(snap.deadlines.every((d) => !d.completedAt))
  assert.equal(snap.plan[0].kind, 'review')
  assert.equal(snap.learner.styleId, 'analogias')
})

test('course detail keeps to its own course', async () => {
  const data = await loadAcademyData(fakeDb(), 'u1')
  const detail = buildCourseDetail(data, 1, today)
  assert.equal(detail.course.name, 'Statistics 201')
  assert.equal(detail.lessons.length, 1)
  assert.equal(detail.deadlines.length, 2)
  assert.ok(detail.plan.every((a) => a.courseId === 1))
  assert.throws(() => buildCourseDetail(data, 99, today), /does not exist/)
})

test('a missing table becomes the setup message, not a crash', async () => {
  await assert.rejects(
    loadAcademyData(fakeDb('academy_courses'), 'u1'),
    (e: any) => e.status === 503 && e.message === SETUP_MESSAGE,
  )
})

test('empty and unfiled academies still get a sensible plan', async () => {
  const data = await loadAcademyData(fakeDb(), 'u1')
  const empty = buildSnapshot(
    { ...data, courses: [], deadlines: [], lessonRecords: [], lessonRows: [], events: [] },
    today,
  )
  assert.equal(empty.plan.length, 0)
  assert.equal(empty.courses.length, 0)
  const legacy = buildSnapshot(
    { ...data, courses: [], deadlines: [], lessonRecords: data.lessonRecords.map((r) => ({ ...r, courseId: null })) },
    today,
  )
  assert.equal(legacy.unsorted.length, 4)
  assert.ok(legacy.plan.length > 0)
  assert.ok(legacy.plan.every((a) => a.courseName === null))
})
