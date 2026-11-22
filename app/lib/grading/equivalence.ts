import { create, all, type MathNode } from 'mathjs'

// Deterministic grading for answers that can be checked without a model: numbers in any reasonable form (0.25, .25,
// 1/4, 25%, 2.5e-1, \frac{1}{4}, 0,25 written with a decimal comma), algebraic expressions (1-(1-p)^n equals
// 1 - (1 - p)**n), and multiple choice. When the answer isn't clean enough to decide for sure, these functions return
// null and grading falls back to the model. They never guess.

const math = create(all, {})

/** Functions a student's expression may use. Anything else (assignments, objects, property access...) is refused. */
const FUNCTIONS = new Set(['sqrt', 'exp', 'log', 'ln', 'abs', 'combinations', 'factorial', 'pow'])
const NODE_TYPES = new Set(['ConstantNode', 'SymbolNode', 'OperatorNode', 'ParenthesisNode', 'FunctionNode'])
const CONSTANTS = new Set(['e', 'pi'])

export type RuleVerdict = { verdict: 'correct' | 'partial' | 'incorrect'; reason: string; errorTag?: string }

/** A known wrong answer. Some deserve partial credit, like P(no successes) when P(at least one) was asked. */
export type Misconception = { answer: string; tag: string; verdict?: 'partial' | 'incorrect' }

/** Words that mean the student isn't committing to one answer. */
const HEDGE = /\b(or|either|maybe|perhaps|not sure|unsure|idk|i don'?t know|no idea|guess)\b|\?\s*$/i

function normalize(raw: string) {
  let s = raw.normalize('NFKC').trim()
  s = s.replace(/^\$+|\$+$/g, '').replace(/\\\(|\\\)|\\\[|\\\]/g, '')
  s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
  s = s
    .replace(/\\cdot|\\times|[×·]/g, '*')
    .replace(/[−–—]/g, '-')
    .replace(/\\left|\\right|\\,|\\;|\\!/g, '')
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)').replace(/\*\*/g, '^')
  s = s.replace(/\^\s*\{([^{}]*)\}/g, '^($1)')
  return s.replace(/\s+/g, ' ').trim()
}

/** The part of an answer after its last "=", without lead-ins like "about" or "P(A|B) =". */
function finalPart(s: string) {
  const parts = s.split(/=|≈/)
  let last = parts[parts.length - 1].trim()
  last = last.replace(/^(the answer is|answer:?|it'?s|its|about|approximately|approx\.?|around|roughly|~)\s*/i, '')
  return last.replace(/[.;,]\s*$/, '').trim()
}

/** A plain number with optional thousands separators or a decimal comma, a percent sign, or an arithmetic expression. */
function toNumber(text: string): { value: number; sigFigs: number; decimals: number } | null {
  let s = text.replace(/\s*(percent|per cent)$/i, '%').trim()
  let percent = false
  if (s.endsWith('%')) {
    percent = true
    s = s.slice(0, -1).trim()
  }
  // 1,000 or 12,500.5: thousands separators. 0,25 or 3,75: a decimal comma. Anything else with a comma: undecided.
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.')
  else if (s.includes(',')) return null
  s = s.replace(/(\d)\s*\*?\s*10\s*\^\s*\(?\s*(-?\d+)\s*\)?/g, '$1e$2')

  const value = evaluateConstant(s)
  if (value === null) return null
  const plain = /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s) ? s : null
  const mantissa = plain?.replace(/^-/, '').replace(/e.*$/i, '') ?? ''
  const digits = mantissa.replace('.', '').replace(/^0+/, '')
  const decimals = mantissa.includes('.') ? mantissa.split('.')[1].length : 0
  const exponent = Number(plain?.match(/e(-?\d+)$/i)?.[1] ?? 0)
  return {
    value: percent ? value / 100 : value,
    // Precision only counts for plain numbers; an expression like 10/40 is exact.
    sigFigs: plain ? digits.length : Infinity,
    decimals: plain ? decimals - exponent + (percent ? 2 : 0) : Infinity,
  }
}

function safeTree(node: MathNode, allowed: Set<string>): boolean {
  let ok = true
  node.traverse((n: MathNode) => {
    if (!NODE_TYPES.has(n.type)) ok = false
    if (n.type === 'FunctionNode') {
      const name = (n as unknown as { fn: { name?: string } }).fn?.name
      if (!name || !FUNCTIONS.has(name)) ok = false
    }
    if (n.type === 'SymbolNode') {
      const name = (n as unknown as { name: string }).name
      const isFunctionName = FUNCTIONS.has(name)
      if (!isFunctionName && !CONSTANTS.has(name) && !allowed.has(name)) ok = false
    }
  })
  return ok
}

function parse(text: string, variables: string[] = []): MathNode | null {
  if (!text || text.length > 200) return null
  try {
    const node = math.parse(text.replace(/\bln\(/g, 'log('))
    return safeTree(node, new Set(variables)) ? node : null
  } catch {
    return null
  }
}

function evaluateConstant(text: string): number | null {
  const node = parse(text)
  if (!node) return null
  try {
    const v = node.compile().evaluate({})
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** The value of a number answer, or null when it's hedged or isn't a number. */
export function readNumber(raw: string) {
  const s = normalize(raw)
  if (!s || HEDGE.test(s)) return null
  return toNumber(finalPart(s))
}

/** True when the answer is only its final value, with no working the model could give partial credit for. */
function bare(raw: string) {
  const s = normalize(raw)
  return (
    finalPart(s) ===
    s
      .replace(/^(the answer is|answer:?|it'?s|its|about|approximately|approx\.?|around|roughly|~)\s*/i, '')
      .replace(/[.;,]\s*$/, '')
      .trim()
  )
}

/**
 * Grades a numeric answer. Accepts a value within the key's tolerance, or one the student rounded correctly to at
 * least two significant figures. Undecided (null) for unclear answers, for wrong values that come with working (the
 * model can give partial credit for it), and for values off by a factor of 100, which usually means a percent mix-up.
 */
export function gradeNumber(
  raw: string,
  accepted: string[],
  tolerance: { abs?: number; rel?: number } = {},
  misconceptions: Misconception[] = [],
): RuleVerdict | null {
  const given = readNumber(raw)
  if (!given) return null
  const targets = accepted.map((a) => readNumber(a)?.value).filter((v): v is number => v !== undefined && v !== null)
  if (!targets.length) return null
  const close = (a: number, b: number, extra = 0) => {
    const tol = Math.max(tolerance.abs ?? 0, Math.abs(b) * (tolerance.rel ?? 1e-9), extra, 1e-12)
    return Math.abs(a - b) <= tol
  }
  const rounding = given.sigFigs >= 2 && Number.isFinite(given.decimals) ? 0.5 * 10 ** -given.decimals + 1e-12 : 0
  if (targets.some((t) => close(given.value, t, rounding))) return { verdict: 'correct', reason: 'Matches the key.' }

  if (!bare(raw)) return null
  for (const m of misconceptions) {
    const wrong = readNumber(m.answer)?.value
    if (wrong !== undefined && wrong !== null && close(given.value, wrong, rounding)) {
      return { verdict: m.verdict ?? 'incorrect', reason: 'Matches a known mistake.', errorTag: m.tag }
    }
  }
  if (targets.some((t) => close(given.value, t * 100, rounding * 100) || close(given.value, t / 100))) return null
  return { verdict: 'incorrect', reason: 'A different value than the key.' }
}

/** Two expressions are equal if they agree at many random points (and at none do they clearly differ). */
export function expressionsEqual(a: string, b: string, variables: string[], trials = 12): boolean | null {
  const na = parse(finalPart(normalize(a)), variables)
  const nb = parse(finalPart(normalize(b)), variables)
  if (!na || !nb) return null
  const fa = na.compile()
  const fb = nb.compile()
  let compared = 0
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < trials * 3 && compared < trials; i++) {
    const scope: Record<string, number> = {}
    for (const v of variables) scope[v] = v === 'n' || v === 'k' ? 2 + Math.floor(rand() * 10) : 0.05 + rand() * 0.9
    try {
      const x = fa.evaluate(scope)
      const y = fb.evaluate(scope)
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue
      if (Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x), Math.abs(y))) return false
      compared++
    } catch {
      continue
    }
  }
  return compared >= Math.min(trials, 6) ? true : null
}

export function gradeExpression(
  raw: string,
  accepted: string[],
  variables: string[],
  misconceptions: Misconception[] = [],
): RuleVerdict | null {
  const s = normalize(raw)
  if (!s || HEDGE.test(s)) return null
  let undecided = false
  for (const a of accepted) {
    const same = expressionsEqual(s, a, variables)
    if (same === true) return { verdict: 'correct', reason: 'Equivalent to the key.' }
    if (same === null) undecided = true
  }
  if (undecided || !bare(raw)) return null
  for (const m of misconceptions) {
    if (expressionsEqual(s, m.answer, variables) === true) {
      return { verdict: m.verdict ?? 'incorrect', reason: 'Matches a known mistake.', errorTag: m.tag }
    }
  }
  return { verdict: 'incorrect', reason: 'Not equivalent to the key.' }
}

/** Multiple choice: "B", "(b)", "option B" or the choice's own text. */
export function gradeChoice(raw: string, accepted: string[], choices: string[]): RuleVerdict | null {
  const s = normalize(raw).toLowerCase()
  if (!s || HEDGE.test(s)) return null
  const letter = s.match(/^(?:option\s+|answer\s+)?\(?([a-h])\)?[.)]?$/i)?.[1]
  const index = letter
    ? letter.charCodeAt(0) - 97
    : choices.findIndex(
        (c) =>
          normalize(c)
            .toLowerCase()
            .replace(/[.\s]+$/, '') === s.replace(/[.\s]+$/, ''),
      )
  if (index < 0 || index >= choices.length) return null
  const picked = String.fromCharCode(65 + index)
  const ok = accepted.some(
    (a) => a.toUpperCase() === picked || normalize(a).toLowerCase() === normalize(choices[index]).toLowerCase(),
  )
  return ok ? { verdict: 'correct', reason: 'The right choice.' } : { verdict: 'incorrect', reason: `Chose ${picked}.` }
}
