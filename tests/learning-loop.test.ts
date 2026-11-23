import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { planToday } from '../app/lib/academy'
import { localDay, skillState, type Evidence, type Facet } from '../app/lib/mastery'
import { skillActions, type SkillInfo } from '../app/lib/next-step'
import {
  buildSummary,
  orderItems,
  planQuestions,
  sessionProgress,
  summaryLines,
  type SessionAnswer,
  type SessionItem,
} from '../app/lib/study'

let seq = 0
function ev(over: Partial<Evidence> & { day: string }): Evidence {
  seq++
  return {
    skillId: 1,
    sessionId: 1,
    itemId: `q${seq}`,
    at: `${over.day}T15:00:${String(seq % 60).padStart(2, '0')}Z`,
    verdict: 'correct',
    mode: 'independent',
    difficulty: 2,
    facet: 'procedural',
    grader: 'rule',
    doubleGraded: null,
    needsReview: false,
    hintsUsed: 0,
    explainedBefore: false,
    teachingRound: 0,
    errorTag: null,
    ...over,
  }
}
const skill = (facets: Facet[] = ['conceptual', 'procedural']) => ({ id: 1, facets })

describe('mastery policy v1', () => {
  test('nothing is confirmed by a single answer', () => {
    const s = skillState(skill(), [ev({ day: '2026-11-22' })], '2026-11-22')
    assert.equal(s.state, 'learning')
    assert.equal(s.reason, 'One answer on your own so far (Nov 22).')
    assert.equal(s.next, 'One more on another day confirms it.')
  })

  test('two answers on the same day are not enough', () => {
    const s = skillState(skill(), [ev({ day: '2026-11-22' }), ev({ day: '2026-11-22' })], '2026-11-22')
    assert.equal(s.state, 'learning')
    assert.equal(s.missing, 'another_day')
  })

  test('two answers on two days, one of them medium, confirm the skill', () => {
    const s = skillState(
      skill(),
      [ev({ day: '2026-11-21', difficulty: 1 }), ev({ day: '2026-11-22', difficulty: 2 })],
      '2026-11-22',
    )
    assert.equal(s.state, 'confirmed')
    assert.equal(s.confirmedOn, '2026-11-22')
    assert.equal(s.reason, 'Two answers on your own, one of medium difficulty or harder, on Nov 21 and Nov 22.')
  })

  test('easy questions alone, or a missing application answer, do not confirm', () => {
    const easy = skillState(
      skill(),
      [ev({ day: '2026-11-21', difficulty: 1 }), ev({ day: '2026-11-22', difficulty: 1 })],
      '2026-11-22',
    )
    assert.equal(easy.missing, 'medium')
    const applied = skillState(
      skill(['procedural', 'application']),
      [ev({ day: '2026-11-21' }), ev({ day: '2026-11-22' })],
      '2026-11-22',
    )
    assert.equal(applied.state, 'learning')
    assert.equal(applied.next, 'One application question confirms it.')
    const done = skillState(
      skill(['procedural', 'application']),
      [ev({ day: '2026-11-21' }), ev({ day: '2026-11-22', facet: 'application' })],
      '2026-11-22',
    )
    assert.equal(done.state, 'confirmed')
  })

  test('answers with help are practice, never proof, however many', () => {
    const helped = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'].map((day) =>
      ev({ day, mode: 'assisted', hintsUsed: 1 }),
    )
    const s = skillState(skill(), helped, '2026-11-22')
    assert.equal(s.state, 'learning')
    assert.equal(s.proofs, 0)
    assert.equal(s.reason, 'Solved with a hint so far.')
    assert.equal(s.lastHelp, 'hint')
  })

  test('a model grade counts only when two gradings agreed; uncertain grades count neither way', () => {
    const single = skillState(
      skill(),
      [ev({ day: '2026-11-21', grader: 'model' }), ev({ day: '2026-11-22', grader: 'model' })],
      '2026-11-22',
    )
    assert.equal(single.state, 'learning')
    assert.equal(single.proofs, 0)
    const agreed = skillState(
      skill(),
      [
        ev({ day: '2026-11-21', grader: 'model', doubleGraded: true }),
        ev({ day: '2026-11-22', grader: 'model', doubleGraded: true }),
      ],
      '2026-11-22',
    )
    assert.equal(agreed.state, 'confirmed')
    const disputed = skillState(
      skill(),
      [ev({ day: '2026-11-22', verdict: 'incorrect', grader: 'model', needsReview: true })],
      '2026-11-22',
    )
    assert.equal(disputed.state, 'new')
    assert.equal(disputed.uncertain, 1)
  })

  test('unclear answers count neither way', () => {
    const s = skillState(skill(), [ev({ day: '2026-11-22', verdict: 'unclear' })], '2026-11-22')
    assert.equal(s.state, 'new')
  })

  test('a wrong last answer, or two of the last three, means practice, even after confirming', () => {
    const base = [ev({ day: '2026-11-20' }), ev({ day: '2026-11-21' })]
    const last = skillState(skill(), [...base, ev({ day: '2026-11-22', verdict: 'incorrect' })], '2026-11-22')
    assert.equal(last.state, 'needs_practice')
    assert.equal(last.reason, 'You missed the last one.')
    const twoOfThree = skillState(
      skill(),
      [
        ev({ day: '2026-11-22', verdict: 'incorrect' }),
        ev({ day: '2026-11-22', verdict: 'incorrect' }),
        ev({ day: '2026-11-22', mode: 'assisted', teachingRound: 2 }),
      ],
      '2026-11-22',
    )
    assert.equal(twoOfThree.state, 'needs_practice')
    assert.equal(twoOfThree.reason, 'You missed two of the last three.')
  })

  test('a confirmed skill comes up for review after 7 days, then 14', () => {
    const confirmed = [ev({ day: '2026-11-01' }), ev({ day: '2026-11-02' })]
    assert.equal(skillState(skill(), confirmed, '2026-11-08').state, 'confirmed')
    const due = skillState(skill(), confirmed, '2026-11-09')
    assert.equal(due.state, 'review')
    assert.equal(due.reason, 'You confirmed it 7 days ago.')
    const reviewed = [...confirmed, ev({ day: '2026-11-09' })]
    assert.equal(skillState(skill(), reviewed, '2026-11-22').state, 'confirmed')
    assert.equal(skillState(skill(), reviewed, '2026-11-23').state, 'review')
  })

  test('local days follow the student’s time zone', () => {
    assert.equal(localDay('2026-11-22T03:30:00Z', 'America/New_York'), '2026-11-21')
    assert.equal(localDay('2026-11-22T03:30:00Z', 'Not/AZone'), '2026-11-22')
  })
})

function item(id: string, over: Partial<SessionItem> = {}): SessionItem {
  return {
    id,
    type: 'question',
    skill_id: 1,
    difficulty: 1,
    facet: 'procedural',
    prompt: id,
    format: 'number',
    ...over,
  }
}
let eventId = 100
function answer(itemId: string, over: Partial<SessionAnswer> = {}): SessionAnswer {
  eventId++
  return {
    ...ev({ day: '2026-11-22', itemId, ...over }),
    eventId,
    answer: '1',
    solution: 'because',
    final: true,
    ...over,
  }
}

describe('a study session', () => {
  test('each question is followed by its explanation and new problem', () => {
    const items = [
      item('q1'),
      item('q2'),
      item('q3'),
      item('x-q2', { type: 'explanation', follows: 'q2', round: 1 }),
      item('p-q2', { follows: 'q2', round: 1 }),
      item('x-p-q2', { type: 'explanation', follows: 'p-q2', round: 2 }),
      item('p-p-q2', { follows: 'p-q2', round: 2 }),
    ]
    assert.deepEqual(
      orderItems(items).map((i) => i.id),
      ['q1', 'q2', 'x-q2', 'p-q2', 'x-p-q2', 'p-p-q2', 'q3'],
    )
  })

  test('a wrong answer asks for teaching before the next question; two rounds at most per skill', () => {
    const items = [item('q1'), item('q2', { skill_id: 2 })]
    let p = sessionProgress(items, [answer('q1', { verdict: 'incorrect' })])
    assert.equal(p.pendingTeach, 'q1')
    assert.equal(p.current, 'q2')

    const taught = [
      ...items,
      item('x-q1', { type: 'explanation', follows: 'q1', round: 1 }),
      item('p-q1', { follows: 'q1', round: 1 }),
    ]
    p = sessionProgress(taught, [answer('q1', { verdict: 'incorrect' })])
    assert.equal(p.pendingTeach, null)
    assert.equal(p.current, 'p-q1')

    const twice = [
      ...taught,
      item('x-p-q1', { type: 'explanation', follows: 'p-q1', round: 2 }),
      item('p-p-q1', { follows: 'p-q1', round: 2 }),
    ]
    p = sessionProgress(twice, [
      answer('q1', { verdict: 'incorrect' }),
      answer('p-q1', { verdict: 'incorrect' }),
      answer('p-p-q1', { verdict: 'incorrect' }),
    ])
    assert.equal(p.pendingTeach, null, 'no third round')
    assert.equal(p.current, 'q2')
  })

  test('a Guided Review reads each explanation right before its first question', () => {
    const items = [
      item('e-q1', { type: 'explanation' }),
      item('q1'),
      item('e-q2', { type: 'explanation', skill_id: 2 }),
      item('q2', { skill_id: 2 }),
      item('q3'),
    ]
    const p = sessionProgress(items, [answer('q1', { mode: 'assisted', explainedBefore: true })])
    assert.deepEqual(
      p.items.map((v) => v.item.id),
      ['e-q1', 'q1', 'e-q2', 'q2', 'q3'],
    )
    assert.equal(p.current, 'q2')
    assert.equal(p.questions, 3)
  })

  test('an unclear first answer keeps the question open', () => {
    const p = sessionProgress([item('q1')], [answer('q1', { verdict: 'unclear', final: false, solution: null })])
    assert.equal(p.current, 'q1')
    assert.equal(p.answered, 0)
  })

  test('four to six questions, one per skill first', () => {
    const st = (id: number, state: 'new' | 'learning' = 'new') => ({
      facets: ['conceptual', 'procedural'] as Facet[],
      state: { ...skillState({ id, facets: [] }, [], '2026-11-22'), skillId: id, state },
    })
    const two = planQuestions([st(1), st(2)])
    assert.equal(two.length, 4)
    assert.deepEqual(
      two.map((q) => [q.skillId, q.difficulty, q.facet]),
      [
        [1, 1, 'conceptual'],
        [2, 1, 'conceptual'],
        [1, 2, 'procedural'],
        [2, 2, 'procedural'],
      ],
    )
    assert.equal(planQuestions([1, 2, 3, 4, 5, 6, 7, 8].map((n) => st(n))).length, 6)
    assert.equal(planQuestions([st(1, 'learning')])[0].difficulty, 2)
  })
})

describe('the closure', () => {
  const names = new Map([
    [1, 'Conditional probability'],
    [2, 'Bayes’ rule'],
  ])
  const items = [
    item('q1'),
    item('q2', { skill_id: 2 }),
    item('x-q2', { type: 'explanation', skill_id: 2, follows: 'q2', round: 1 }),
    item('p-q2', { skill_id: 2, follows: 'q2', round: 1 }),
    item('q3'),
  ]

  test('says what happened today and, apart, how mastery moved, with no empty category', () => {
    const answers = [
      answer('q1'),
      answer('q2', { skillId: 2, verdict: 'incorrect', errorTag: 'Divided by P(A) instead of P(B)' }),
      answer('p-q2', { skillId: 2, mode: 'assisted', explainedBefore: true, teachingRound: 1 }),
    ]
    const states = new Map(
      [1, 2].map((id) => [
        id,
        skillState(
          { id, facets: [] },
          answers.filter((a) => a.skillId === id).map((a) => ({ ...a, skillId: id })),
          '2026-11-22',
        ),
      ]),
    )
    const summary = buildSummary({
      courseName: 'Stat 161',
      activeSeconds: 14 * 60,
      items,
      answers,
      skillNames: names,
      states,
      tomorrow: { title: 'Confirm “Bayes’ rule” without help', minutes: 8 },
      finished: false,
    })
    const lines = summaryLines(summary)
    assert.deepEqual(lines.today, [
      'You worked 14 minutes on three questions.',
      'On your own: Conditional probability.',
      'Learned with help: Bayes’ rule, solved on the second try after the explanation.',
      'Corrected: divided by P(A) instead of P(B).',
      'One question left. Pick up where you stopped within two days.',
    ])
    assert.deepEqual(
      lines.overTime.map((o) => o.text),
      [
        'One answer on your own so far (Nov 22). One more on another day confirms it.',
        'Solved after an explanation so far. One answer without help starts to confirm it.',
      ],
    )
    assert.equal(lines.tomorrow, 'Confirm “Bayes’ rule” without help, about 8 minutes.')
    const everything = [...lines.today, ...lines.overTime.map((o) => o.text), lines.tomorrow ?? ''].join(' ')
    assert.doesNotMatch(everything, /\bnothing\b|\b0 \w|\bno (questions|answers|skills)\b/i)
  })

  test('a session stopped before any answer still names what happened', () => {
    const summary = buildSummary({
      courseName: 'Stat 161',
      activeSeconds: 20,
      items,
      answers: [],
      skillNames: names,
      states: new Map(),
      tomorrow: null,
      finished: false,
    })
    assert.deepEqual(summaryLines(summary).today, [
      'You opened a Quick Check for Stat 161. Your questions are saved.',
      'Four questions left. Pick up where you stopped within two days.',
    ])
  })
})

describe('the next step', () => {
  const courseNames = new Map([[7, 'Stat 161']])
  const info = (id: number, name: string, evidence: Evidence[], today: string): SkillInfo => ({
    id,
    name,
    courseId: 7,
    facets: ['procedural'],
    state: skillState({ id, facets: ['procedural'] }, evidence, today),
  })
  const material = {
    id: 3,
    title: 'Lecture 14',
    courseId: 7,
    status: 'mapped',
    createdAt: '2026-11-20',
    skillIds: [1, 2],
  }

  test("yesterday's session changes today's first recommendation", () => {
    const today = '2026-11-22'
    const before = skillActions({
      today,
      now: new Date(`${today}T14:00:00Z`),
      courseNames,
      deadlines: [],
      skills: [info(1, 'Conditional probability', [], today), info(2, 'Bayes’ rule', [], today)],
      materials: [material],
      sessions: [],
    })
    const planBefore = planToday({ today, courses: [], deadlines: [], lessons: [], extra: before })
    assert.equal(planBefore[0].kind, 'first-check')
    assert.equal(planBefore[0].why, 'You added Lecture 14 and haven’t practiced it yet.')

    const yesterday = [
      ev({ day: '2026-11-21', skillId: 1 }),
      ev({ day: '2026-11-21', skillId: 2, verdict: 'incorrect' }),
      ev({ day: '2026-11-21', skillId: 2, mode: 'assisted', hintsUsed: 1 }),
    ]
    const after = skillActions({
      today,
      now: new Date(`${today}T14:00:00Z`),
      courseNames,
      deadlines: [],
      skills: [
        info(
          1,
          'Conditional probability',
          yesterday.filter((e) => e.skillId === 1),
          today,
        ),
        info(
          2,
          'Bayes’ rule',
          yesterday.filter((e) => e.skillId === 2),
          today,
        ),
      ],
      materials: [material],
      sessions: [{ id: 9, courseId: 7, status: 'completed', lastActiveAt: '2026-11-21T20:00:00Z', remaining: 0 }],
    })
    const planAfter = planToday({ today, courses: [], deadlines: [], lessons: [], extra: after })
    assert.equal(planAfter[0].kind, 'confirm')
    assert.equal(planAfter[0].title, 'Confirm “Conditional probability” and “Bayes’ rule” without help')
    assert.equal(planAfter[0].why, 'Yesterday you practiced these. Today, without help.')
    assert.deepEqual(planAfter[0].session, { courseId: 7, skillIds: [1, 2] })
    assert.ok(!planAfter.some((a) => a.kind === 'first-check'))
  })

  test('one skill solved with a hint yesterday: confirm it today, without help', () => {
    const today = '2026-11-22'
    const actions = skillActions({
      today,
      now: new Date(),
      courseNames,
      deadlines: [],
      skills: [info(2, 'Bayes’ rule', [ev({ day: '2026-11-21', skillId: 2, mode: 'assisted', hintsUsed: 1 })], today)],
      materials: [],
      sessions: [],
    })
    assert.equal(actions[0].why, 'Yesterday you solved it with a hint. Today, without help.')
  })

  test('no confirming on the same day, and a paused Quick Check is resumed for 48 hours', () => {
    const today = '2026-11-22'
    const now = new Date(`${today}T18:00:00Z`)
    const actions = skillActions({
      today,
      now,
      courseNames,
      deadlines: [],
      skills: [info(1, 'Conditional probability', [ev({ day: today, skillId: 1 })], today)],
      materials: [],
      sessions: [
        { id: 4, courseId: 7, status: 'active', lastActiveAt: '2026-11-22T17:00:00Z', remaining: 2 },
        { id: 5, courseId: 7, status: 'active', lastActiveAt: '2026-11-19T17:00:00Z', remaining: 3 },
      ],
    })
    assert.deepEqual(
      actions.map((a) => a.key),
      ['resume-4'],
    )
    assert.equal(actions[0].why, 'You stopped halfway through a Quick Check for Stat 161.')
    assert.equal(actions[0].href, '/sessions/4')
  })
})

describe('who the learning loop is open to', () => {
  test('everyone where it is configured, or only the accounts on the list', async () => {
    const { loopAllowed } = await import('../app/lib/server/learning-data')
    const before = process.env.LYCEO_LEARNING_LOOP_EMAILS
    try {
      delete process.env.LYCEO_LEARNING_LOOP_EMAILS
      assert.equal(loopAllowed({ email: 'anyone@example.com' }), true)
      process.env.LYCEO_LEARNING_LOOP_EMAILS = ' Owner@Example.com, second@example.com '
      assert.equal(loopAllowed({ email: 'owner@example.com' }), true)
      assert.equal(loopAllowed({ email: 'someone@example.com' }), false)
      assert.equal(loopAllowed({ email: null }), false)
      assert.equal(loopAllowed(null), false)
    } finally {
      if (before === undefined) delete process.env.LYCEO_LEARNING_LOOP_EMAILS
      else process.env.LYCEO_LEARNING_LOOP_EMAILS = before
    }
  })
})
