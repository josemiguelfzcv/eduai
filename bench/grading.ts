/**
 * Grading benchmark v2: partial credit, mathematical equivalence, ambiguous answers, manipulation attempts and
 * error analysis, for the study-session grader (app/lib/server/grading.ts).
 *
 *   npm run bench:grading                       rules only: no API key, no cost
 *   ANTHROPIC_API_KEY=… npm run bench:grading   rules + each model in BENCH_MODELS
 *
 * The model's self-reported confidence is measured here (calibration table), never trusted. Two prompt variants grade
 * every model-graded answer, to measure how often independent gradings agree and how accurate they are when they do.
 * Writes bench/out/grading-report.md, grading-results.json and grading-review.csv (for a human to confirm labels).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { judge, gradeAttempt, ruleGrade, type Verdict } from '../app/lib/server/grading'
import type { ItemKey, PublicItem } from '../app/lib/server/records'
import { onUsage, type UsageRecord } from '../app/lib/server/usage'
import { calibration, cohensKappa, percentile, wilson } from './stats'

process.env.LYCEO_USAGE_LOG = 'off'
const DRY = process.env.BENCH_DRY_RUN === '1'
if (DRY) installFakeGrader()
const RULES_ONLY = !process.env.ANTHROPIC_API_KEY
const MODELS = RULES_ONLY
  ? []
  : (process.env.BENCH_MODELS || 'claude-sonnet-4-6,claude-sonnet-5-5,claude-haiku-5-5')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
const OUT = 'bench/out'
const CONCURRENCY = 4
const VERDICTS: Verdict[] = ['correct', 'partial', 'incorrect', 'unclear']

type Item = {
  prompt: string
  format: PublicItem['format']
  choices?: string[]
  facet: PublicItem['facet']
  difficulty: 1 | 2 | 3
  key: ItemKey
}
type Case = { id: string; item: string; answer: string; expected: Verdict; tags: string[]; why?: string }
const data = JSON.parse(readFileSync('bench/data/grading-v2.json', 'utf8')) as {
  labels: string
  items: Record<string, Item>
  cases: Case[]
}

/**
 * Gates. Model comparison can run on draft labels. Production readiness needs human-confirmed labels and more cases;
 * the report says so until bench/data/grading-v2-human.csv exists and covers them.
 */
export const GATES = {
  comparison: { minAccuracy: 0.85, maxFalseCredits: 1, maxInjectionFailures: 0, maxP95Ms: 8000 },
  production: {
    minHumanConfirmedCases: 150,
    minAccuracyLowerBound: 0.85,
    maxFalseCreditUpperBound: 0.05,
    minPartialRecall: 0.75,
    minUnclearRecall: 0.7,
    maxInjectionFailures: 0,
    minKappaVsHumans: 0.75,
  },
}

type Row = {
  model: string
  id: string
  tags: string[]
  expected: Verdict
  verdict: Verdict | 'error'
  grader: 'rule' | 'model' | 'error'
  rubric: string
  errorTag: string | null
  feedback: string
  confidence: number | null
  variantB: Verdict | null
  latencyMs: number
  costUsd: number
}

function publicOf(id: string, item: Item): PublicItem {
  return {
    id,
    type: 'question',
    skillId: 1,
    difficulty: item.difficulty,
    facet: item.facet,
    prompt: item.prompt,
    format: item.format,
    choices: item.choices,
  }
}

async function pool<T>(tasks: (() => Promise<T>)[], size: number) {
  const out: T[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < tasks.length) {
        const i = next++
        out[i] = await tasks[i]()
      }
    }),
  )
  return out
}

async function runModel(model: string): Promise<Row[]> {
  return pool(
    data.cases.map((c) => async () => {
      const item = data.items[c.item]
      const pub = publicOf(c.item, item)
      let cost = 0
      const stop = onUsage((r: UsageRecord) => (cost += r.costUsd ?? 0))
      const started = Date.now()
      try {
        const graded = await gradeAttempt({ item: pub, key: item.key, answer: c.answer, userId: null, model })
        const latencyMs = Date.now() - started
        let variantB: Verdict | null = null
        if (graded.grader === 'model')
          variantB = (await judge(pub, item.key, c.answer, 'b', { userId: null, model })).verdict
        return {
          model,
          id: c.id,
          tags: c.tags,
          expected: c.expected,
          verdict: graded.verdict,
          grader: graded.grader,
          rubric: graded.rubricTotal ? `${graded.rubricMet}/${graded.rubricTotal}` : '',
          errorTag: graded.errorTag,
          feedback: graded.feedback,
          confidence: graded.confidence,
          variantB,
          latencyMs,
          costUsd: cost,
        }
      } catch (err) {
        return {
          model,
          id: c.id,
          tags: c.tags,
          expected: c.expected,
          verdict: 'error',
          grader: 'error',
          rubric: '',
          errorTag: String((err as Error).message).slice(0, 120),
          feedback: '',
          confidence: null,
          variantB: null,
          latencyMs: Date.now() - started,
          costUsd: cost,
        }
      } finally {
        stop()
      }
    }),
    CONCURRENCY,
  )
}

function runRules(): Row[] {
  return data.cases.map((c) => {
    const item = data.items[c.item]
    const rule = ruleGrade(publicOf(c.item, item), item.key, c.answer)
    return {
      model: 'rules only',
      id: c.id,
      tags: c.tags,
      expected: c.expected,
      verdict: rule?.verdict ?? 'error',
      grader: rule ? 'rule' : 'error',
      rubric: '',
      errorTag: rule?.errorTag ?? null,
      feedback: rule?.reason ?? 'left to the model',
      confidence: null,
      variantB: null,
      latencyMs: 0,
      costUsd: 0,
    }
  })
}

function summarize(rows: Row[]) {
  const graded = rows.filter((r) => r.verdict !== 'error')
  const right = graded.filter((r) => r.verdict === r.expected)
  const notCorrect = graded.filter((r) => r.expected !== 'correct')
  const falseCredits = notCorrect.filter((r) => r.verdict === 'correct')
  const falseDenials = graded.filter(
    (r) => r.expected === 'correct' && (r.verdict === 'incorrect' || r.verdict === 'partial'),
  )
  const recall = (label: Verdict) => {
    const wanted = graded.filter((r) => r.expected === label)
    return wanted.length ? wanted.filter((r) => r.verdict === label).length / wanted.length : NaN
  }
  const injections = rows.filter((r) => r.tags.includes('injection'))
  const modelRows = graded.filter((r) => r.grader === 'model')
  const both = modelRows.filter((r) => r.variantB)
  const agree = both.filter((r) => r.variantB === r.verdict)
  const confusion = Object.fromEntries(
    VERDICTS.map((e) => [
      e,
      Object.fromEntries(
        [...VERDICTS, 'error'].map((g) => [g, rows.filter((r) => r.expected === e && r.verdict === g).length]),
      ),
    ]),
  )
  return {
    n: rows.length,
    errors: rows.length - graded.length,
    accuracy: wilson(right.length, graded.length),
    byRules: rows.filter((r) => r.grader === 'rule').length,
    ruleAccuracy: wilson(
      graded.filter((r) => r.grader === 'rule' && r.verdict === r.expected).length,
      rows.filter((r) => r.grader === 'rule').length,
    ),
    falseCredits: falseCredits.length,
    falseCreditRate: wilson(falseCredits.length, notCorrect.length),
    falseDenials: falseDenials.length,
    partialRecall: recall('partial'),
    unclearRecall: recall('unclear'),
    injectionFailures: injections.filter((r) => r.verdict === 'correct').length,
    calibration: calibration(
      modelRows
        .filter((r) => r.confidence !== null)
        .map((r) => ({ confidence: r.confidence!, right: r.verdict === r.expected })),
    ),
    agreement: {
      n: both.length,
      rate: both.length ? agree.length / both.length : NaN,
      accuracyWhenAgree: agree.length ? agree.filter((r) => r.verdict === r.expected).length / agree.length : NaN,
      accuracyWhenDisagree:
        both.length - agree.length
          ? both.filter((r) => r.variantB !== r.verdict && r.verdict === r.expected).length /
            (both.length - agree.length)
          : NaN,
      falseCreditsWhenBothSayCorrect: agree.filter((r) => r.verdict === 'correct' && r.expected !== 'correct').length,
    },
    kappaVsDraft: cohensKappa(
      graded.map((r) => r.expected),
      graded.map((r) => r.verdict),
    ),
    p95Ms: percentile(
      modelRows.map((r) => r.latencyMs),
      95,
    ),
    costUsd: rows.reduce((s, r) => s + r.costUsd, 0),
    confusion,
  }
}

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '–')
const ci = (w: { p: number; low: number; high: number }) => `${pct(w.p)} (95% CI ${pct(w.low)}–${pct(w.high)})`

function tagTable(rows: Row[]) {
  const tags = [...new Set(rows.flatMap((r) => r.tags))].sort()
  return tags
    .map((t) => {
      const inTag = rows.filter((r) => r.tags.includes(t))
      return `| ${t} | ${inTag.length} | ${inTag.filter((r) => r.verdict === r.expected).length} | ${inTag.filter((r) => r.grader === 'rule').length} |`
    })
    .join('\n')
}

function report(results: { model: string; rows: Row[]; s: ReturnType<typeof summarize> }[]) {
  const human = humanLabels()
  const lines = [
    '# Grading benchmark v2',
    '',
    `${data.cases.length} answers to ${Object.keys(data.items).length} questions. ${data.labels}`,
    DRY ? '\n**DRY RUN: canned model answers. These numbers mean nothing.**\n' : '',
    human
      ? `Human labels: ${human.size} cases confirmed in bench/data/grading-v2-human.csv.`
      : 'Human labels: none yet. Production-readiness gates cannot pass until a human confirms at least ' +
        `${GATES.production.minHumanConfirmedCases} labels (fill in bench/out/grading-review.csv and save it as bench/data/grading-v2-human.csv).`,
    '',
    '## Summary',
    '',
    '| Model | Accuracy | Decided by rules | False credits | False denials | Partial recall | Unclear recall | Manipulation failures | Two gradings agree | p95 latency | Cost |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...results.map(
      ({ model, s }) =>
        `| ${model} | ${ci(s.accuracy)} | ${s.byRules}/${s.n} | ${s.falseCredits} (${pct(s.falseCreditRate.p)}, ≤${pct(s.falseCreditRate.high)}) | ${s.falseDenials} | ${pct(s.partialRecall)} | ${pct(s.unclearRecall)} | ${s.injectionFailures} | ${pct(s.agreement.rate)} | ${Number.isFinite(s.p95Ms) ? `${(s.p95Ms / 1000).toFixed(1)} s` : '–'} | $${s.costUsd.toFixed(3)} |`,
    ),
    '',
    'False credit: a verdict of correct for an answer that is partial, incorrect or unclear. The bound is the upper end of its 95% Wilson interval.',
    '',
  ]
  for (const { model, rows, s } of results) {
    const passes =
      s.accuracy.p >= GATES.comparison.minAccuracy &&
      s.falseCredits <= GATES.comparison.maxFalseCredits &&
      s.injectionFailures <= GATES.comparison.maxInjectionFailures &&
      !(s.p95Ms > GATES.comparison.maxP95Ms)
    lines.push(
      `## ${model}`,
      '',
      model === 'rules only'
        ? `Rules decided ${s.byRules} of ${s.n} answers with no model call; accuracy on those: ${ci(s.ruleAccuracy)}. The rest go to the model.`
        : `Comparison gates (draft labels): ${passes ? 'pass' : 'fail'}. Errors: ${s.errors}. Cohen's κ against the draft labels: ${s.kappaVsDraft.toFixed(2)}.`,
      '',
      '### Confusion matrix (rows: expected, columns: verdict)',
      '',
      '| expected \\ got | correct | partial | incorrect | unclear | not decided |',
      '|---|---|---|---|---|---|',
      ...VERDICTS.map(
        (e) =>
          `| ${e} | ${['correct', 'partial', 'incorrect', 'unclear', 'error'].map((g) => s.confusion[e][g]).join(' | ')} |`,
      ),
      '',
    )
    if (model !== 'rules only') {
      lines.push(
        '### Self-reported confidence vs. accuracy',
        '',
        `Over ${s.calibration.n} model-graded answers: expected calibration error ${pct(s.calibration.ece)}, Brier score ${s.calibration.brier.toFixed(3)}, AUROC ${s.calibration.auroc.toFixed(2)} (0.5 = confidence says nothing about being right). Lyceo doesn't use this number for decisions.`,
        '',
        '| Stated confidence | Answers | Mean stated | Actually right |',
        '|---|---|---|---|',
        ...s.calibration.bins.map(
          (b) => `| ${b.from.toFixed(1)}–${b.to.toFixed(1)} | ${b.n} | ${pct(b.meanConfidence)} | ${pct(b.accuracy)} |`,
        ),
        '',
        '### Two independent gradings',
        '',
        `Agreed on ${pct(s.agreement.rate)} of ${s.agreement.n} answers. Accuracy when they agree: ${pct(s.agreement.accuracyWhenAgree)}; when they disagree: ${pct(s.agreement.accuracyWhenDisagree)}. False credits that survive agreement: ${s.agreement.falseCreditsWhenBothSayCorrect}.`,
        '',
      )
    }
    lines.push(
      '### By kind of answer',
      '',
      '| Tag | Answers | Right | By rules |',
      '|---|---|---|---|',
      tagTable(rows),
      '',
    )
    // In the rules-only run, answers the rules leave to the model aren't mistakes.
    const misses = rows.filter((r) => r.verdict !== r.expected && !(model === 'rules only' && r.verdict === 'error'))
    lines.push(
      '### Error analysis',
      '',
      misses.length
        ? [
            '| Case | Tags | Expected | Got | Grader | Rubric | Error tag | Feedback |',
            '|---|---|---|---|---|---|---|---|',
            ...misses.map((r) => {
              const c = data.cases.find((x) => x.id === r.id)!
              return `| ${r.id}: "${c.answer.replace(/\|/g, '/').slice(0, 70)}" | ${r.tags.join(', ')} | ${r.expected} | ${r.verdict} | ${r.grader} | ${r.rubric} | ${(r.errorTag ?? '').replace(/\|/g, '/')} | ${r.feedback.replace(/\|/g, '/').slice(0, 90)} |`
            }),
          ].join('\n')
        : 'No mismatches.',
      '',
    )
  }
  return lines.join('\n')
}

function reviewSheet(results: { model: string; rows: Row[] }[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const header = [
    'id',
    'question',
    'answer',
    'draft_label',
    ...results.map((r) => `verdict_${r.model}`),
    'human_label',
    'notes',
  ]
  const lines = data.cases.map((c) =>
    [
      c.id,
      data.items[c.item].prompt,
      c.answer,
      c.expected,
      ...results.map((r) => r.rows.find((x) => x.id === c.id)?.verdict ?? ''),
      '',
      c.why ?? '',
    ]
      .map((v) => esc(String(v)))
      .join(','),
  )
  return [header.join(','), ...lines].join('\n') + '\n'
}

/**
 * The same answers for a human to label without seeing anyone else's verdict: no draft label, no model verdicts, no
 * reasons. Fill human_label with correct, partial, incorrect or unclear, then save it as bench/data/grading-v2-human.csv.
 */
function blindSheet() {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const header = ['id', 'question', 'accepted_answer', 'rubric', 'answer', 'human_label', 'notes']
  const lines = data.cases.map((c) => {
    const item = data.items[c.item]
    const rubric = (item.key.rubric ?? []).map((p) => `${p.point}${p.required === false ? ' (optional)' : ''}`)
    return [c.id, item.prompt, item.key.accepted.join(' or '), rubric.join(' | '), c.answer, '', '']
      .map((v) => esc(String(v)))
      .join(',')
  })
  return [header.join(','), ...lines].join('\n') + '\n'
}

/** Labels a human confirmed or changed: bench/data/grading-v2-human.csv with columns id,human_label. */
function humanLabels(): Map<string, Verdict> | null {
  try {
    const text = readFileSync('bench/data/grading-v2-human.csv', 'utf8')
    const [head, ...rows] = text.trim().split(/\r?\n/)
    const cols = head.split(',').map((h) => h.replace(/"/g, ''))
    const id = cols.indexOf('id')
    const label = cols.indexOf('human_label')
    const map = new Map<string, Verdict>()
    for (const row of rows) {
      const cells =
        row
          .match(/("([^"]|"")*"|[^,]*)(,|$)/g)
          ?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) ?? []
      if (VERDICTS.includes(cells[label] as Verdict)) map.set(cells[id], cells[label] as Verdict)
    }
    return map.size ? map : null
  } catch {
    return null
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const results: { model: string; rows: Row[]; s: ReturnType<typeof summarize> }[] = []
  const rules = runRules()
  results.push({ model: 'rules only', rows: rules, s: summarize(rules) })
  for (const model of MODELS) {
    console.log(`Grading ${data.cases.length} answers with ${model}…`)
    const rows = await runModel(model)
    results.push({ model, rows, s: summarize(rows) })
  }
  const human = humanLabels()
  if (human) {
    for (const r of results) {
      const shared = r.rows.filter((x) => human.has(x.id) && x.verdict !== 'error')
      console.log(
        `${r.model}: κ vs humans ${cohensKappa(
          shared.map((x) => human.get(x.id)!),
          shared.map((x) => x.verdict),
        ).toFixed(2)} on ${shared.length} cases`,
      )
    }
  }
  writeFileSync(`${OUT}/grading-report.md`, report(results))
  writeFileSync(
    `${OUT}/grading-results.json`,
    JSON.stringify(
      results.map(({ model, s, rows }) => ({ model, summary: s, rows })),
      null,
      2,
    ),
  )
  writeFileSync(`${OUT}/grading-review.csv`, reviewSheet(results))
  writeFileSync(`${OUT}/grading-label-blind.csv`, blindSheet())
  for (const { model, s } of results) {
    console.log(
      `${model.padEnd(20)} accuracy ${ci(s.accuracy)}  rules ${s.byRules}/${s.n}  false credits ${s.falseCredits}  manipulation failures ${s.injectionFailures}`,
    )
  }
  console.log(`Wrote ${OUT}/grading-report.md, grading-results.json, grading-review.csv and grading-label-blind.csv`)
}

/** Canned judgments, to check the harness without an API key. */
function installFakeGrader() {
  process.env.ANTHROPIC_API_KEY = 'dry-run'
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    const prompt = JSON.stringify(body.messages ?? '')
    const points = (prompt.match(/\\n\d+\. /g) ?? []).length || 1
    const answer = {
      ambiguity: 'none',
      points: Array.from({ length: points }, () => ({ point: 'x', met: true, evidence: 'none' })),
      errorTag: '',
      feedback: 'ok',
      confidence: 0.9,
    }
    const useTool = (body.tools ?? []).length > 0
    const content = useTool
      ? [{ type: 'tool_use', id: 't', name: body.tools[0].name, input: answer }]
      : [{ type: 'text', text: JSON.stringify(answer) }]
    return new Response(
      JSON.stringify({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content,
        stop_reason: useTool ? 'tool_use' : 'end_turn',
        usage: { input_tokens: 800, output_tokens: 150 },
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
