import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { toItem, type GeneratedQuestion } from '../app/lib/questions'
import { findQuote, joinPages, mapHeadline, splitPages, verifyIdeas, type ProposedIdea } from '../app/lib/skill-map'

const pages = [
  { n: 1, text: 'Lecture 14\nConditional probability' },
  {
    n: 2,
    text: 'The conditional proba-\nbility of A given B is P(A ∩ B) divided by P(B), defined only when P(B) > 0.',
  },
  { n: 3, text: 'Bayes’ rule lets us “flip” the conditioning: P(A|B) = P(B|A)P(A)/P(B).' },
  { n: 4, text: 'Exampleswithoutspaces:thelawoftotalprobabilitysumsoverapartition' },
]

describe('quotes are checked against the pages', () => {
  test('found despite line-break hyphens, curly quotes and case', () => {
    assert.deepEqual(findQuote('The conditional probability of A given B is P(A ∩ B) divided by P(B)', pages), [2])
    assert.deepEqual(findQuote('Bayes\' rule lets us "flip" the conditioning', pages), [3])
  })

  test('found when the PDF lost the spaces between words', () => {
    assert.deepEqual(findQuote('the law of total probability sums over a partition', pages), [4])
  })

  test('pieces around an ellipsis must appear in order on one page', () => {
    assert.deepEqual(findQuote('The conditional probability … defined only when P(B) > 0', pages), [2])
    assert.deepEqual(findQuote('defined only when P(B) > 0 … The conditional probability', pages), [])
  })

  test('made-up or tiny quotes are not found', () => {
    assert.deepEqual(findQuote('Conditional probability is always symmetric in A and B', pages), [])
    assert.deepEqual(findQuote('Lecture', pages), [])
  })
})

describe('a proposed map is verified before it is written', () => {
  const idea = (over: Partial<ProposedIdea>): ProposedIdea => ({
    name: 'Conditional probability',
    objective: 'Compute P(A|B) from a joint probability.',
    facets: ['procedural'],
    pages: [2],
    quote: 'The conditional probability of A given B is P(A ∩ B) divided by P(B)',
    sameAsExistingId: null,
    ...over,
  })

  test('a quote on its page is extracted; one that is nowhere is inferred and dropped', () => {
    const [found, guessed] = verifyIdeas(
      [idea({}), idea({ name: 'Independence', quote: 'Independent events never overlap', pages: [3] })],
      pages,
      [],
    )
    assert.equal(found.origin, 'extracted')
    assert.deepEqual(found.pages, [2])
    assert.equal(guessed.origin, 'inferred')
    assert.equal(guessed.quote, null)
    assert.deepEqual(guessed.pages, [3])
  })

  test('a quote cited on the wrong page moves to the page it is on', () => {
    const [v] = verifyIdeas([idea({ pages: [1] })], pages, [])
    assert.deepEqual(v.pages, [2])
  })

  test('pages that do not exist and unknown facets are dropped', () => {
    const [v] = verifyIdeas([idea({ quote: '', pages: [2, 99, -1], facets: ['vibes'] })], pages, [])
    assert.deepEqual(v.pages, [2])
    assert.deepEqual(v.facets, ['conceptual'])
  })

  test('joins only with this course’s skills, and flags joins under another name', () => {
    const existing = [{ id: 7, name: 'Conditional probability' }]
    const [sameName] = verifyIdeas([idea({})], pages, existing)
    assert.equal(sameName.existingSkillId, 7)
    assert.equal(sameName.joined, false)
    const [renamed] = verifyIdeas([idea({ name: 'Probability of A given B', sameAsExistingId: 7 })], pages, existing)
    assert.equal(renamed.existingSkillId, 7)
    assert.equal(renamed.joined, true)
    const [foreign] = verifyIdeas([idea({ name: 'Something else', sameAsExistingId: 12345 })], pages, existing)
    assert.equal(foreign.existingSkillId, null)
  })

  test('duplicates merge, keeping a verified quote', () => {
    const out = verifyIdeas(
      [idea({ quote: '', pages: [1] }), idea({ name: 'conditional probability.', pages: [2] })],
      pages,
      [],
    )
    assert.equal(out.length, 1)
    assert.equal(out[0].origin, 'extracted')
    assert.deepEqual(out[0].pages, [1, 2])
  })

  test('the headline leaves out empty parts', () => {
    assert.equal(mapHeadline(6, 4), 'I found 6 ideas in this material: 4 were already in your course and 2 are new.')
    assert.equal(mapHeadline(3, 0), 'I found 3 ideas in this material.')
    assert.equal(mapHeadline(2, 2), 'I found 2 ideas in this material, all already in your course.')
  })

  test('pages round-trip through the stored text and offsets', () => {
    const { text, pages: offsets } = joinPages(['one', ' two ', 'three'])
    assert.deepEqual(
      splitPages(text, offsets).map((p) => [p.n, p.text]),
      [
        [1, 'one'],
        [2, 'two'],
        [3, 'three'],
      ],
    )
  })
})

describe('a written question becomes an item only if it can be graded', () => {
  const slot = { skillId: 3, difficulty: 2 as const, facet: 'procedural' as const }
  const q = (over: Partial<GeneratedQuestion>): GeneratedQuestion => ({
    format: 'number',
    prompt: 'P(A ∩ B) = 0.1 and P(B) = 0.4. What is P(A|B)?',
    choices: [],
    answer: '0.25',
    tolerance: null,
    rubric: [],
    mistakes: [{ answer: '0.4', why: 'Divided by P(A)' }],
    hints: ['Which event do you know happened?', 'The answer is 0.25', 'Divide 0.1 by 0.4 to get 0.25'],
    solution: 'P(A|B) = 0.1 / 0.4 = 0.25.',
    page: 2,
    ...over,
  })

  test('a number question keeps its key apart and drops hints that give the answer away', () => {
    const item = toItem('q1', slot, q({}))!
    assert.equal(item.format, 'number')
    assert.deepEqual(item.key?.accepted, ['0.25'])
    assert.deepEqual(item.key?.hints, ['Which event do you know happened?'])
    assert.deepEqual(item.key?.misconceptions, [{ answer: '0.4', tag: 'Divided by P(A)', verdict: 'incorrect' }])
  })

  test('a small number in a hint is not mistaken for the answer', () => {
    const item = toItem('q1', slot, q({ answer: '2', hints: ['P(A) = 0.2 here, so start from that.'] }))!
    assert.deepEqual(item.key?.hints, ['P(A) = 0.2 here, so start from that.'])
  })

  test('a number answer that is not a number is refused', () => {
    assert.equal(toItem('q1', slot, q({ answer: 'one quarter' })), null)
  })

  test('choice answers become a letter; labels are stripped; bad choices are refused', () => {
    const choices = ['A) 0.25', 'B) 0.4', 'C) 0.1', 'D) 0.04']
    assert.deepEqual(toItem('q1', slot, q({ format: 'choice', choices, answer: 'A' }))!.choices, [
      '0.25',
      '0.4',
      '0.1',
      '0.04',
    ])
    assert.deepEqual(toItem('q1', slot, q({ format: 'choice', choices, answer: '0.4' }))!.key?.accepted, ['B'])
    assert.equal(toItem('q1', slot, q({ format: 'choice', choices, answer: 'E' })), null)
    assert.equal(toItem('q1', slot, q({ format: 'choice', choices: ['0.25', '0.25', '0.1'], answer: 'A' })), null)
  })

  test('a short answer needs a rubric with a required point', () => {
    const base = { format: 'short_text' as const, answer: 'Because P(B) is the new sample space.' }
    assert.equal(toItem('q1', slot, q({ ...base, rubric: [] })), null)
    const item = toItem(
      'q1',
      slot,
      q({ ...base, rubric: [{ point: 'Says B becomes the sample space', required: true }] }),
    )!
    assert.equal(item.key?.rubric?.length, 1)
  })
})

describe('what the student reads after a miss', () => {
  test('markdown emphasis never shows its asterisks; math is left alone', async () => {
    const { plainText } = await import('../app/lib/text')
    assert.equal(plainText('is called **probing the model** (choice B)'), 'is called probing the model (choice B)')
    assert.equal(plainText('## Idea\nUse $a**b$ and __this__.'), 'Idea\nUse $a**b$ and this.')
  })

  test('a new problem that repeats the explanation’s words is caught', async () => {
    const { tooClose } = await import('../app/lib/questions')
    const explanation =
      'The one that treats the model as a function, then perturbs input and observes how output changes is called probing the model.'
    assert.equal(
      tooClose(
        'Which strategy treats the model as a function, then perturbs input and observes how output changes?',
        explanation,
      ),
      true,
    )
    assert.equal(
      tooClose(
        'A team reads the attention weights of a transformer to see which words mattered. Which strategy is that, and why is it not probing?',
        explanation,
      ),
      false,
    )
  })
})
