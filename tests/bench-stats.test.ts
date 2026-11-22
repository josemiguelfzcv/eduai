import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calibration, cohensKappa, percentile, wilson } from '../bench/stats'

const near = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`)

test('Wilson intervals match the textbook values', () => {
  const w = wilson(25, 26)
  near(w.low, 0.8112)
  near(w.high, 0.9932)
  near(wilson(0, 100).high, 0.037, 1e-3)
  assert.deepEqual(wilson(0, 0).low, 0)
})

test("Cohen's kappa: 1 for perfect agreement, 0 for chance, negative for systematic disagreement", () => {
  assert.equal(cohensKappa(['a', 'b', 'a', 'b'], ['a', 'b', 'a', 'b']), 1)
  near(cohensKappa(['a', 'a', 'b', 'b'], ['a', 'b', 'a', 'b']), 0)
  assert.ok(cohensKappa(['a', 'b'], ['b', 'a']) < 0)
})

test('calibration: a model that is always 90% sure but right half the time is badly calibrated and uninformative', () => {
  const points = Array.from({ length: 10 }, (_, i) => ({ confidence: 0.9, right: i % 2 === 0 }))
  const c = calibration(points)
  near(c.ece, 0.4)
  near(c.brier, 0.41)
  assert.equal(c.auroc, 0.5)
  const informative = calibration([
    { confidence: 0.95, right: true },
    { confidence: 0.9, right: true },
    { confidence: 0.6, right: false },
    { confidence: 0.55, right: false },
  ])
  assert.equal(informative.auroc, 1)
})

test('percentile', () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3)
  assert.equal(percentile([1, 2, 3, 4, 100], 95), 100)
})
