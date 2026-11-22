import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expressionsEqual, gradeChoice, gradeExpression, gradeNumber, readNumber } from '../app/lib/grading/equivalence'

const v = (r: ReturnType<typeof gradeNumber>) => r?.verdict ?? null

test('numbers in every reasonable form', () => {
  for (const answer of [
    '0.6',
    '.6',
    '0.60',
    '60%',
    '60 percent',
    '3/5',
    '0,6',
    '6e-1',
    '6 × 10^-1',
    '\\frac{3}{5}',
    '$0.6$',
    'P(E|S) = 0.3/0.5 = 0.6',
    'about 0.6',
  ]) {
    assert.equal(v(gradeNumber(answer, ['0.6'])), 'correct', answer)
  }
  assert.equal(readNumber('1,000')?.value, 1000)
  assert.equal(readNumber('12,500.5')?.value, 12500.5)
  assert.equal(readNumber('0,25')?.value, 0.25)
  assert.equal(readNumber('−2')?.value, -2)
})

test('rounding counts only when the student kept two significant figures', () => {
  assert.equal(v(gradeNumber('0.092', ['0.09174'])), 'correct')
  assert.equal(v(gradeNumber('9.2%', ['0.09174'])), 'correct')
  assert.equal(v(gradeNumber('0.1', ['0.09174'])), 'incorrect')
  assert.equal(v(gradeNumber('9%', ['0.09174'], { abs: 0.002 })), 'correct', 'the key may allow a looser estimate')
})

test('wrong values: a bare number is incorrect; one with working goes to the model', () => {
  assert.equal(v(gradeNumber('0.3', ['0.6'])), 'incorrect')
  assert.equal(gradeNumber('10 × 0.2 = 20', ['2']), null)
  assert.deepEqual(gradeNumber('0.3', ['0.6'], {}, [{ answer: '0.3', tag: 'used the joint probability' }]), {
    verdict: 'incorrect',
    reason: 'Matches a known mistake.',
    errorTag: 'used the joint probability',
  })
})

test('hedged, wordy or percent-confused answers are left to the model', () => {
  for (const answer of [
    '0.6 or 0.3',
    'either 0.6 or 0.3',
    'maybe 0.6?',
    'idk',
    'its 0.3 divided by 0.5 so about .6',
    '60',
    '2 dollars',
  ]) {
    assert.equal(gradeNumber(answer, answer === '2 dollars' ? ['2'] : ['0.6']), null, answer)
  }
})

test('expressions are equal when they agree everywhere, not when they look alike', () => {
  for (const answer of ['1-(1-p)^n', '1 - (1 - p)**n', '-(1-p)^n + 1', '1-(1-p)^{n}', 'P = 1 - (1-p)^n']) {
    assert.equal(gradeExpression(answer, ['1-(1-p)^n'], ['p', 'n'])?.verdict, 'correct', answer)
  }
  assert.equal(gradeExpression('n*p', ['1-(1-p)^n'], ['p', 'n'])?.verdict, 'incorrect')
  assert.equal(gradeExpression('1-p^n', ['1-(1-p)^n'], ['p', 'n'])?.verdict, 'incorrect')
  assert.equal(
    gradeExpression(
      '(1-p)^n',
      ['1-(1-p)^n'],
      ['p', 'n'],
      [{ answer: '(1-p)^n', tag: 'forgot 1 minus', verdict: 'partial' }],
    )?.verdict,
    'partial',
  )
  assert.equal(gradeExpression('np', ['1-(1-p)^n'], ['p', 'n']), null, 'unknown symbols go to the model')
  assert.equal(gradeExpression('1 - (1-p)·n', ['1-(1-p)^n'], ['p', 'n'])?.verdict, 'incorrect')
  assert.equal(
    gradeExpression('1 - P(none) = 1 - (1-p)·n', ['1-(1-p)^n'], ['p', 'n']),
    null,
    'working goes to the model',
  )
  assert.equal(expressionsEqual('(p+q)^2', 'p^2 + 2*p*q + q^2', ['p', 'q']), true)
  assert.equal(expressionsEqual('(p+q)^2', 'p^2 + q^2', ['p', 'q']), false)
})

test('nothing but arithmetic is ever evaluated', () => {
  for (const evil of ['import("fs")', '1 = f(x)', 'a.b', '[1,2]', '{a: 1}', 'evaluate("1")', 'x = 2']) {
    assert.equal(gradeNumber(evil, ['1']), null, evil)
  }
})

test('multiple choice by letter or by text', () => {
  const choices = ['The heights in one sample', 'The distribution of the sample mean over all samples', 'All heights']
  for (const answer of ['B', 'b)', '(b)', 'option B', 'The distribution of the sample mean over all samples']) {
    assert.equal(gradeChoice(answer, ['B'], choices)?.verdict, 'correct', answer)
  }
  assert.equal(gradeChoice('A', ['B'], choices)?.verdict, 'incorrect')
  assert.equal(gradeChoice('B or C', ['B'], choices), null)
  assert.equal(gradeChoice('La B', ['B'], choices), null)
})
