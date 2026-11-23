import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { renderInline } from '../app/lib/lesson-render'
import { anchorAt, blockIds, cleanOutline, parseSection, readingMinutes, scrollFor } from '../app/lib/written-lesson'

const SECTION = `Today we study **moment generating functions** (MGFs).

:::definition What is a moment generating function?
The MGF of a random variable $X$ is

$$M_X(t) = E[e^{tX}].$$

When it exists near $t = 0$ it determines the distribution.
:::

:::example Example 1: MGF of a discrete random variable
Let $X \\sim \\text{Bernoulli}(p)$.
$$
M_X(t) = (1-p) + pe^t
$$
- $E[X] = M_X'(0) = p$
- $\\mathrm{Var}(X) = p(1-p)$
:::takeaways
- The MGF is $E[e^{tX}]$.
- Moments come from derivatives at $t = 0$.
:::
:::

### Why it matters
Next, a continuous example.`

describe('a written lesson section', () => {
  test('becomes paragraphs, boxes, formulas and lists with ids in reading order', () => {
    const blocks = parseSection('s2', SECTION)
    assert.deepEqual(
      blocks.map((b) => b.type),
      ['paragraph', 'box', 'box', 'heading', 'paragraph'],
    )
    const def = blocks[1]
    assert.ok(def.type === 'box')
    assert.equal(def.kind, 'definition')
    assert.equal(def.title, 'What is a moment generating function?')
    assert.deepEqual(
      def.blocks.map((b) => b.type),
      ['paragraph', 'math', 'paragraph'],
    )
    const example = blocks[2]
    assert.ok(example.type === 'box')
    assert.equal(example.open, false)
    assert.deepEqual(
      example.blocks.map((b) => b.type),
      ['paragraph', 'math', 'list'],
    )
    assert.ok(example.aside?.type === 'box' && example.aside.kind === 'takeaways')
    assert.equal(blockIds(blocks)[0], 's2-b1')
    assert.equal(new Set(blockIds(blocks)).size, blockIds(blocks).length)
  })

  test('a section still being written shows what has arrived, with the open box still open', () => {
    const partial = SECTION.slice(0, SECTION.indexOf('When it exists'))
    const blocks = parseSection('s2', partial)
    const def = blocks[1]
    assert.ok(def.type === 'box' && def.open)
    assert.equal(def.blocks[1].type, 'math')
    // Ids of what was already there don't change as more text arrives.
    assert.deepEqual(blockIds(blocks), blockIds(parseSection('s2', SECTION)).slice(0, blockIds(blocks).length))
  })

  test('an unfinished formula still shows', () => {
    const blocks = parseSection('s1', 'Look:\n\n$$\nM_X(t) = E[')
    assert.equal(blocks[1].type, 'math')
  })

  test('inline text is escaped, with bold, italic and math drawn', () => {
    const html = renderInline('A **key** idea, *gently*: $x^2$ <script>')
    assert.match(html, /<strong>key<\/strong>/)
    assert.match(html, /<em>gently<\/em>/)
    assert.match(html, /katex/)
    assert.match(html, /&lt;script&gt;/)
  })

  test('reading time counts formulas as slower than words', () => {
    assert.equal(readingMinutes('word '.repeat(400)), 2)
  })
})

describe('the lesson outline', () => {
  test('keeps real skills and pages, numbers sections s1, s2, ... and caps their length', () => {
    const outline = cleanOutline(
      [
        { title: 'Foundations', goal: 'Why', kind: 'foundations', skillIds: [1, 99], pages: [2, 3, 400], minutes: 6 },
        { title: '', goal: 'dropped' },
        { title: 'Example: Bernoulli', kind: 'nonsense', minutes: 90 },
      ],
      { skillIds: new Set([1, 2]), pages: new Set([1, 2, 3]) },
    )
    assert.deepEqual(
      outline.map((s) => [s.id, s.title, s.kind, s.skillIds, s.pages, s.minutes]),
      [
        ['s1', 'Foundations', 'foundations', [1], [2, 3], 6],
        ['s2', 'Example: Bernoulli', 'concept', [], [], 30],
      ],
    )
  })
})

describe('the reading position', () => {
  const blocks = [
    { id: 's1-b1', section: 's1', top: 0, height: 200 },
    { id: 's1-b2', section: 's1', top: 200, height: 400 },
    { id: 's2-b1', section: 's2', top: 600, height: 100 },
  ]

  test('is the block at the top of the view and how far into it', () => {
    assert.deepEqual(anchorAt(300, blocks), { section: 's1', block: 's1-b2', offset: 0.25 })
    assert.deepEqual(anchorAt(0, blocks), { section: 's1', block: 's1-b1', offset: 0 })
  })

  test('comes back to the same words after the column changes width', () => {
    const anchor = anchorAt(300, blocks)!
    // The column got narrower: the same block is now taller and lower down.
    assert.equal(scrollFor(anchor, { top: 260, height: 520 }), 390)
  })
})
