// Small statistics helpers for the benchmarks. Pure functions, unit-tested in tests/bench-stats.test.ts.

/** Wilson score interval for a proportion (95% by default). Honest at small n, unlike the normal approximation. */
export function wilson(successes: number, n: number, z = 1.96): { p: number; low: number; high: number } {
  if (n === 0) return { p: NaN, low: 0, high: 1 }
  const p = successes / n
  const z2 = z * z
  const center = (p + z2 / (2 * n)) / (1 + z2 / n)
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n)
  return { p, low: Math.max(0, center - half), high: Math.min(1, center + half) }
}

/** Cohen's kappa between two raters over the same items: agreement beyond what chance would give. */
export function cohensKappa(a: string[], b: string[]): number {
  if (a.length !== b.length || a.length === 0) return NaN
  const n = a.length
  const labels = [...new Set([...a, ...b])]
  const observed = a.filter((x, i) => x === b[i]).length / n
  const expected = labels.reduce(
    (sum, l) => sum + (a.filter((x) => x === l).length / n) * (b.filter((x) => x === l).length / n),
    0,
  )
  return expected === 1 ? 1 : (observed - expected) / (1 - expected)
}

export type Calibration = {
  bins: { from: number; to: number; n: number; meanConfidence: number; accuracy: number }[]
  /** Expected calibration error: average gap between stated confidence and observed accuracy, weighted by bin size. */
  ece: number
  /** Mean squared error of confidence as a probability of being right. */
  brier: number
  /** Probability that a random right verdict had higher confidence than a random wrong one. 0.5 means uninformative. */
  auroc: number
  n: number
}

export function calibration(
  points: { confidence: number; right: boolean }[],
  edges = [0, 0.5, 0.7, 0.8, 0.9, 1.0001],
): Calibration {
  const n = points.length
  const bins = edges.slice(0, -1).map((from, i) => {
    const to = edges[i + 1]
    const inside = points.filter((p) => p.confidence >= from && p.confidence < to)
    const meanConfidence = inside.length ? inside.reduce((s, p) => s + p.confidence, 0) / inside.length : NaN
    const accuracy = inside.length ? inside.filter((p) => p.right).length / inside.length : NaN
    return { from, to: Math.min(to, 1), n: inside.length, meanConfidence, accuracy }
  })
  const ece = n ? bins.reduce((s, b) => (b.n ? s + (b.n / n) * Math.abs(b.accuracy - b.meanConfidence) : s), 0) : NaN
  const brier = n ? points.reduce((s, p) => s + (p.confidence - (p.right ? 1 : 0)) ** 2, 0) / n : NaN
  const right = points.filter((p) => p.right).map((p) => p.confidence)
  const wrong = points.filter((p) => !p.right).map((p) => p.confidence)
  let wins = 0
  for (const r of right) for (const w of wrong) wins += r > w ? 1 : r === w ? 0.5 : 0
  const auroc = right.length && wrong.length ? wins / (right.length * wrong.length) : NaN
  return { bins, ece, brier, auroc, n }
}

export function percentile(values: number[], p: number) {
  if (!values.length) return NaN
  const sorted = [...values].sort((x, y) => x - y)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}
