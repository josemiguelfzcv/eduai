import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildLessonProgress,
  datedDeadlines,
  planToday,
  summarizeCourses,
  pendingReview,
  daysBetween,
  whenLabel,
  listConcepts,
  currentTerm,
  proximity,
  type AcademyCourse,
  type Deadline,
  type LessonRecord,
  type CheckIn,
} from '../app/lib/academy'

test('academy planning: dates, progress, ranking, reviews, budgets and summaries', () => {
  const seg = (concept: string) => ({
    concept,
    narration: 'n',
    board: ['b'],
    check: { question: 'q?', idealAnswer: 'a' },
  })
  const script = (title: string, concepts: string[], meta?: object) => ({
    title,
    estimatedMinutes: concepts.length * 2,
    segments: concepts.map(seg),
    meta,
  })

  // --- dates & helpers
  assert.equal(daysBetween('2026-11-17', '2026-11-20'), 3)
  assert.equal(daysBetween('2026-11-17T23:59:00Z', '2026-11-18'), 1)
  assert.equal(daysBetween('2026-12-30', '2027-01-02'), 3)
  assert.equal(whenLabel(0), 'today')
  assert.equal(whenLabel(1), 'tomorrow')
  assert.equal(whenLabel(5), 'in 5 days')
  assert.equal(listConcepts(['A']), 'A')
  assert.equal(listConcepts(['A', 'B']), 'A and B')
  assert.equal(listConcepts(['A', 'B', 'C', 'D']), 'A, B and 2 more')
  assert.equal(currentTerm(new Date(2026, 10, 17)), 'Fall 2026')
  assert.equal(currentTerm(new Date(2027, 1, 3)), 'Spring 2027')
  assert.equal(proximity(-1), 0)
  assert.equal(proximity(1), 1)
  assert.equal(proximity(25), 0)

  // --- lesson progress
  const records: LessonRecord[] = [
    {
      id: 10,
      title: 'Sampling',
      createdAt: '2026-11-10T10:00:00Z',
      courseId: 1,
      script: script('Sampling distributions', [
        'Sampling distribution',
        'Standard error',
        'Why n matters',
        'CLT',
        'Confidence',
      ]),
    },
    {
      id: 11,
      title: 'Trees',
      createdAt: '2026-11-12T10:00:00Z',
      courseId: 2,
      script: script('Binary search trees', ['BST property', 'Insert', 'Delete', 'Balance', 'Traversal']),
    },
    {
      id: 12,
      title: 'Elasticity',
      createdAt: '2026-11-01T10:00:00Z',
      courseId: 3,
      script: script('Price elasticity', ['Elasticity', 'Total revenue']),
    },
    { id: 13, title: 'Broken', createdAt: '2026-11-02T10:00:00Z', courseId: null, script: null },
    {
      id: 14,
      title: 'Old',
      createdAt: '2026-04-07T10:00:00Z',
      courseId: null,
      script: {
        titulo: 'Grupos',
        duracion_estimada: '6 minutos',
        segmentos: [{ concepto: 'Grupo', narracion: 'x', pizarra: 'y', pregunta_check: '¿?' }],
      },
    },
  ]
  const ci = (lessonId: number, part: number, correct: boolean, at: string): CheckIn => ({
    lessonId,
    part,
    correct,
    at,
  })
  const checkIns: CheckIn[] = [
    // lesson 10: all five parts answered, misses on parts 1 and 2 (first try), part 1 later right
    ci(10, 0, true, '2026-11-14T10:00:00Z'),
    ci(10, 1, false, '2026-11-14T10:02:00Z'),
    ci(10, 1, true, '2026-11-14T10:03:00Z'),
    ci(10, 2, false, '2026-11-14T10:05:00Z'),
    ci(10, 3, true, '2026-11-14T10:07:00Z'),
    ci(10, 4, true, '2026-11-14T10:09:00Z'),
    // lesson 11: stopped after part 2
    ci(11, 0, true, '2026-11-16T09:00:00Z'),
    ci(11, 1, false, '2026-11-16T09:03:00Z'),
  ]
  const progress = buildLessonProgress(records, checkIns)
  const p = (id: number) => progress.find((l) => l.id === id)!
  assert.equal(p(10).status, 'done')
  assert.equal(p(10).partsChecked, 5)
  assert.equal(p(10).firstTryCorrect, 3)
  assert.deepEqual(
    p(10).missed.map((m) => m.concept),
    ['Why n matters', 'Standard error'],
  )
  assert.equal(p(11).status, 'in-progress')
  assert.equal(p(11).resumePart, 3)
  assert.equal(p(12).status, 'new')
  assert.equal(p(12).resumePart, 1)
  assert.equal(p(13).status, 'not-ready')
  assert.equal(p(14).status, 'new')
  assert.equal(p(14).title, 'Grupos')

  // --- plan
  const today = '2026-11-17'
  const courses: AcademyCourse[] = [
    { id: 1, name: 'Statistics 201', code: 'STAT 201', term: 'Fall 2026', createdAt: '2026-09-01' },
    { id: 2, name: 'Data Structures', code: 'CS 136', term: 'Fall 2026', createdAt: '2026-09-01' },
    { id: 3, name: 'Microeconomics', code: null, term: 'Fall 2026', createdAt: '2026-09-01' },
    { id: 4, name: 'Linear Algebra', code: 'MATH 250', term: 'Fall 2026', createdAt: '2026-09-01' },
  ]
  const raw: Deadline[] = [
    { id: 1, courseId: 1, title: 'Midterm 2', kind: 'exam', dueOn: '2026-11-20', topics: null, completedAt: null },
    {
      id: 2,
      courseId: 2,
      title: 'Problem set 7',
      kind: 'assignment',
      dueOn: '2026-11-21',
      topics: null,
      completedAt: null,
    },
    { id: 3, courseId: 3, title: 'Quiz 4', kind: 'quiz', dueOn: '2026-12-10', topics: null, completedAt: null },
    { id: 4, courseId: 4, title: 'Exam 2', kind: 'exam', dueOn: '2026-11-22', topics: null, completedAt: null },
    {
      id: 5,
      courseId: 1,
      title: 'Old quiz',
      kind: 'quiz',
      dueOn: '2026-11-10',
      topics: null,
      completedAt: '2026-11-10',
    },
  ]
  const deadlines = datedDeadlines(raw, courses, today)
  assert.equal(deadlines[0].title, 'Old quiz')
  assert.equal(deadlines.find((d) => d.id === 1)!.daysLeft, 3)

  const plan = planToday({ today, courses, deadlines, lessons: progress })
  assert.equal(plan.length, 3)
  assert.equal(plan[0].kind, 'review')
  assert.equal(plan[0].lessonId, 10)
  assert.equal(plan[0].href, null)
  assert.match(plan[0].title, /“Why n matters” and “Standard error”/)
  assert.match(plan[0].why, /this week\. Midterm 2 is in 3 days\./)
  assert.equal(plan[1].kind, 'add-material')
  assert.equal(plan[1].href, '/upload?course=4')
  assert.equal(plan[2].kind, 'continue')
  assert.equal(plan[2].href, '/class/11?part=3')
  assert.match(plan[2].why, /stopped after part 2 of 5/)
  assert.ok(plan.reduce((n, a) => n + a.minutes, 0) <= 45)

  // A review lesson created after the miss replaces the review suggestion...
  const withReview = buildLessonProgress(
    [
      ...records,
      {
        id: 20,
        title: 'Review',
        createdAt: '2026-11-15T12:00:00Z',
        courseId: 1,
        script: script('Review: Sampling distributions', ['Standard error', 'Why n matters'], {
          version: 2,
          kind: 'review',
          sourceCourseId: 10,
        }),
      },
    ],
    checkIns,
  )
  const plan2 = planToday({ today, courses, deadlines, lessons: withReview })
  assert.equal(plan2[0].kind, 'open-review')
  assert.equal(plan2[0].href, '/class/20')
  assert.ok(!plan2.some((a) => a.kind === 'review' && a.lessonId === 10))
  assert.equal(
    pendingReview(
      withReview.find((l) => l.id === 10)!,
      withReview,
    ).length,
    0,
  )
  // ...and once the review is answered, neither shows up.
  const plan3 = planToday({
    today,
    courses,
    deadlines,
    lessons: buildLessonProgress(
      [
        ...records,
        {
          id: 20,
          title: 'Review',
          createdAt: '2026-11-15T12:00:00Z',
          courseId: 1,
          script: script('Review: Sampling', ['Standard error'], { version: 2, kind: 'review', sourceCourseId: 10 }),
        },
      ],
      [...checkIns, ci(20, 0, true, '2026-11-16T12:00:00Z')],
    ),
  })
  assert.ok(!plan3.some((a) => a.lessonId === 10 || a.lessonId === 20))

  // Deadlines change the order: with no exams at all, the unfinished lesson outranks a new one.
  const calm = planToday({ today, courses, deadlines: [], lessons: progress })
  assert.equal(calm[0].kind, 'review')
  assert.equal(calm[1].kind, 'continue')
  assert.equal(calm[2].kind, 'start')
  assert.ok(!calm.some((a) => a.kind === 'add-material'))
  // Completed deadlines don't count.
  const done = planToday({
    today,
    courses,
    deadlines: datedDeadlines(
      raw.map((d) => ({ ...d, completedAt: '2026-11-16' })),
      courses,
      today,
    ),
    lessons: progress,
  })
  assert.ok(!done.some((a) => a.kind === 'add-material'))
  // Minute budget: one long step still shows; extra steps must fit.
  const tight = planToday({ today, courses, deadlines, lessons: progress }, { minuteBudget: 8 })
  assert.equal(tight.length, 1)
  assert.equal(tight[0].kind, 'review')
  const roomy = planToday({ today, courses, deadlines, lessons: progress }, { minuteBudget: 11 })
  assert.equal(roomy.length, 2)
  assert.equal(roomy[1].kind, 'add-material')
  // Empty academy.
  assert.deepEqual(planToday({ today, courses: [], deadlines: [], lessons: [] }), [])

  // --- course summaries
  const summary = summarizeCourses(courses, progress, deadlines)
  const stats = summary.find((c) => c.id === 1)!
  assert.equal(stats.lessons, 1)
  assert.equal(stats.conceptsChecked, 5)
  assert.equal(stats.firstTryCorrect, 3)
  assert.equal(stats.toReview, 2)
  assert.equal(stats.nextDeadline?.title, 'Midterm 2')
  assert.equal(summary.find((c) => c.id === 4)!.lessons, 0)
})
