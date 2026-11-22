/**
 * Benchmarks Claude models on Lyceo's real tasks before any model switch.
 *
 *   ANTHROPIC_API_KEY=… npm run bench
 *   BENCH_MODELS=claude-sonnet-4-6,claude-haiku-5-5 BENCH_REPEAT=3 ANTHROPIC_API_KEY=… npm run bench
 *
 * Tasks: grading check-in answers (the production prompt), solving math problems with known answers, and writing a
 * lesson from a sample lecture (the production prompt). Writes bench/out/report.md, results.json and a blind review
 * sheet for the lessons. Cost comes from the token counts each call reports, priced in app/lib/server/usage.ts.
 */
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, Output } from 'ai'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import type { Lesson, Segment } from '../app/lib/lesson'
import { gradeAnswer, writeLesson } from '../app/lib/server/ai'
import { onUsage, recordUsage, tokensFromSdk, type UsageRecord } from '../app/lib/server/usage'

process.env.LYCEO_USAGE_LOG = 'off'
// BENCH_DRY_RUN=1 checks the harness itself with canned answers and fake token counts. Its numbers mean nothing.
if (process.env.BENCH_DRY_RUN === '1') installFakeClaude()
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY to run the benchmark. A separate key with a spend limit is safest.')
  process.exit(2)
}

const MODELS = (process.env.BENCH_MODELS || 'claude-sonnet-4-6,claude-sonnet-5-5,claude-haiku-5-5')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)
const REPEAT = Math.max(1, Math.floor(Number(process.env.BENCH_REPEAT) || 1))
const CONCURRENCY = 4
const OUT = 'bench/out'

/** Quality gates a model must pass for a task. Proposed defaults; adjust them in review. */
const GATES = {
  grade: { minAccuracy: 0.92, maxFalseCredits: 1, maxP95Ms: 6000 },
  math: { minAccuracy: 0.94, maxP95Ms: 20000 },
  lesson: { minFormat: 0.9, maxP95Ms: 90000 },
}

type Call = {
  task: 'grade' | 'math' | 'lesson'
  model: string
  id: string
  ok: boolean
  pass?: boolean
  ms: number
  note?: string
}
const calls: Call[] = []
const usage: UsageRecord[] = []
onUsage((r) => usage.push(r))

async function pool<T>(items: T[], run: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) await run(queue.shift()!)
    }),
  )
}

async function measure<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> {
  const started = Date.now()
  try {
    return { value: await fn(), ms: Date.now() - started }
  } catch (err) {
    return { error: err instanceof Error ? err.message.slice(0, 200) : String(err), ms: Date.now() - started }
  }
}

const runs = <T>(items: T[]) =>
  MODELS.flatMap((model) => items.flatMap((item) => Array.from({ length: REPEAT }, () => ({ model, item }))))

// 1. Grading check-in answers with the production prompt.
type GradingData = {
  segments: Record<
    string,
    { concept: string; narration: string; board: string[]; question: string; idealAnswer: string }
  >
  cases: { id: string; segment: string; answer: string; expected: boolean; kind: string }[]
}
const grading: GradingData = JSON.parse(readFileSync('bench/data/grading.json', 'utf8'))
const toSegment = (s: GradingData['segments'][string]): Segment => ({
  concept: s.concept,
  narration: s.narration,
  board: s.board,
  check: { question: s.question, idealAnswer: s.idealAnswer },
})

// 2. Math accuracy without tools.
type MathData = { problems: { id: string; question: string; answer: number; tolerance: number }[] }
const math: MathData = JSON.parse(readFileSync('bench/data/math.json', 'utf8'))
const mathSchema = z.object({
  work: z.string().describe('Brief working, at most 120 words'),
  answer: z.number().describe('The final answer as a decimal number'),
})
async function solve(model: string, question: string) {
  const started = Date.now()
  try {
    const result = await generateText({
      model: anthropic(model),
      output: Output.object({ schema: mathSchema }),
      maxOutputTokens: 1500,
      system:
        'You are a careful statistics tutor. Solve the problem exactly. Keep the working brief, then give the final answer as a decimal number.',
      prompt: question,
    })
    recordUsage({
      task: 'bench-math',
      provider: 'anthropic',
      model,
      latencyMs: Date.now() - started,
      ok: true,
      tokens: tokensFromSdk(result.usage),
    })
    return result.output
  } catch (err) {
    recordUsage({ task: 'bench-math', provider: 'anthropic', model, latencyMs: Date.now() - started, ok: false })
    throw err
  }
}

// 3. Lesson writing with the production prompt, checked against the prompt's own format rules.
const lecture = readFileSync('bench/data/lecture.md', 'utf8')
function formatProblems(lesson: Omit<Lesson, 'meta'>) {
  const problems: string[] = []
  let checks = 0
  const check = (ok: boolean, problem: string) => {
    checks++
    if (!ok) problems.push(problem)
  }
  check(
    lesson.segments.length >= 4 && lesson.segments.length <= 7,
    `${lesson.segments.length} parts (steady pace asks for 4 to 7)`,
  )
  lesson.segments.forEach((s, i) => {
    const words = s.narration.split(/\s+/).filter(Boolean).length
    check(words >= 80 && words <= 170, `part ${i + 1}: ${words} words of narration (80 to 170)`)
    check(!/[$\\*#]/.test(s.narration), `part ${i + 1}: symbols or LaTeX in the spoken narration`)
    check(s.board.length >= 2 && s.board.length <= 5, `part ${i + 1}: ${s.board.length} board lines (2 to 5)`)
    for (const line of s.board) check(line.length < 60, `part ${i + 1}: board line over 60 characters`)
    check(
      !!s.check.question.trim() && !!s.check.idealAnswer.trim(),
      `part ${i + 1}: missing check question or ideal answer`,
    )
  })
  return { problems, score: checks ? (checks - problems.length) / checks : 0 }
}
const lessons: { model: string; lesson: Omit<Lesson, 'meta'> }[] = []

async function main() {
  console.log(`Models: ${MODELS.join(', ')} · ${REPEAT} run(s) per case`)

  await pool(runs(grading.cases), async ({ model, item }) => {
    const r = await measure(() =>
      gradeAnswer({
        segment: toSegment(grading.segments[item.segment]),
        answer: item.answer,
        styleId: null,
        missedBefore: 0,
        model,
      }),
    )
    const pass = r.value ? r.value.correct === item.expected : undefined
    calls.push({
      task: 'grade',
      model,
      id: item.id,
      ok: !r.error,
      pass,
      ms: r.ms,
      note:
        r.error ??
        (pass
          ? undefined
          : `graded ${r.value!.correct ? 'correct' : 'wrong'}, expected ${item.expected ? 'correct' : 'wrong'} (${item.kind})`),
    })
  })
  console.log('grading done')

  await pool(runs(math.problems), async ({ model, item }) => {
    const r = await measure(() => solve(model, item.question))
    const pass = r.value ? Math.abs(r.value.answer - item.answer) <= item.tolerance : undefined
    calls.push({
      task: 'math',
      model,
      id: item.id,
      ok: !r.error,
      pass,
      ms: r.ms,
      note: r.error ?? (pass ? undefined : `answered ${r.value!.answer}, expected ${item.answer}`),
    })
  })
  console.log('math done')

  await pool(runs([lecture]), async ({ model }) => {
    const r = await measure(() =>
      writeLesson({
        courseTitle: 'Statistics',
        material: lecture,
        student: { styleId: null, major: null, pace: 'steady', focusConcepts: [] },
        model,
      }),
    )
    if (r.value) lessons.push({ model, lesson: r.value })
    const format = r.value ? formatProblems(r.value) : null
    calls.push({
      task: 'lesson',
      model,
      id: 'lecture-9',
      ok: !r.error,
      pass: format ? format.score >= GATES.lesson.minFormat : undefined,
      ms: r.ms,
      note: r.error ?? format?.problems.join('; '),
    })
  })
  console.log('lessons done')

  writeOutputs()
}

const pct = (values: number[], q: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]
}
const usageTask = { grade: 'grade', math: 'bench-math', lesson: 'lesson' } as const
const money = (n: number) => `$${n.toFixed(n < 0.01 ? 5 : 4)}`

function writeOutputs() {
  mkdirSync(OUT, { recursive: true })
  const rows: string[] = []
  const verdicts: Record<string, Record<string, boolean>> = {}
  for (const task of ['grade', 'math', 'lesson'] as const) {
    rows.push(
      `\n## ${{ grade: 'Grading check-in answers', math: 'Math accuracy', lesson: 'Writing a lesson' }[task]}\n`,
    )
    rows.push('| Model | Score | False credits | Errors | p50 | p95 | Cost per call | Total cost | Passes gates |')
    rows.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const model of MODELS) {
      const mine = calls.filter((c) => c.task === task && c.model === model)
      const done = mine.filter((c) => c.ok)
      const score = done.length ? done.filter((c) => c.pass).length / mine.length : 0
      const falseCredits = task === 'grade' ? mine.filter((c) => c.note?.startsWith('graded correct')).length : 0
      const lat = done.map((c) => c.ms)
      const records = usage.filter((u) => u.task === usageTask[task] && u.model === model)
      const cost = records.reduce((s, u) => s + (u.costUsd ?? 0), 0)
      const lesson =
        task === 'lesson' ? lessons.filter((l) => l.model === model).map((l) => formatProblems(l.lesson).score) : []
      const shown = task === 'lesson' ? (lesson.length ? lesson.reduce((a, b) => a + b, 0) / lesson.length : 0) : score
      const gate =
        task === 'grade'
          ? score >= GATES.grade.minAccuracy &&
            falseCredits <= GATES.grade.maxFalseCredits &&
            pct(lat, 0.95) <= GATES.grade.maxP95Ms
          : task === 'math'
            ? score >= GATES.math.minAccuracy && pct(lat, 0.95) <= GATES.math.maxP95Ms
            : shown >= GATES.lesson.minFormat && pct(lat, 0.95) <= GATES.lesson.maxP95Ms
      ;(verdicts[model] ??= {})[task] = gate
      rows.push(
        `| ${model} | ${(shown * 100).toFixed(0)}% | ${task === 'grade' ? falseCredits : '–'} | ${mine.length - done.length} | ${(pct(lat, 0.5) / 1000).toFixed(1)} s | ${(pct(lat, 0.95) / 1000).toFixed(1)} s | ${money(records.length ? cost / records.length : 0)} | ${money(cost)} | ${gate ? 'yes' : 'no'} |`,
      )
    }
    const misses = calls.filter((c) => c.task === task && c.note)
    if (misses.length) {
      rows.push('\nMisses and errors:\n')
      for (const c of misses) rows.push(`- ${c.model}, ${c.id}: ${c.note}`)
    }
  }
  const total = usage.reduce((s, u) => s + (u.costUsd ?? 0), 0)
  const report = [
    `# Model benchmark, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `Models: ${MODELS.join(', ')}. Runs per case: ${REPEAT}. Total cost of this run: ${money(total)}.`,
    `Grading: ${grading.cases.length} labeled answers. Math: ${math.problems.length} problems. Lessons: 1 lecture per model per run.`,
    `Gates: grading ≥ ${GATES.grade.minAccuracy * 100}% and at most ${GATES.grade.maxFalseCredits} false credit; math ≥ ${GATES.math.minAccuracy * 100}%; lesson format ≥ ${GATES.lesson.minFormat * 100}%; p95 latency limits per task.`,
    'Factual correctness of the lessons is judged by a person: see lessons-blind.md.',
    ...rows,
  ].join('\n')
  writeFileSync(`${OUT}/report.md`, report + '\n')
  writeFileSync(
    `${OUT}/results.json`,
    JSON.stringify({ models: MODELS, repeat: REPEAT, gates: GATES, verdicts, calls, usage }, null, 2),
  )

  // Blind review: the lessons appear as A, B, C… in random order; the key is in a separate file.
  const shuffled = [...lessons].sort(() => Math.random() - 0.5)
  const letters = shuffled.map((_, i) => String.fromCharCode(65 + i))
  const blind = shuffled.map(({ lesson }, i) =>
    [
      `## Lesson ${letters[i]}: ${lesson.title}`,
      ...lesson.segments.map(
        (s, j) =>
          `\n**Part ${j + 1}: ${s.concept}**\n\n${s.narration}\n\nBoard: ${s.board.join(' · ')}\n\nCheck: ${s.check.question} (ideal: ${s.check.idealAnswer})`,
      ),
      '\nFactual or math errors (list them):\n\nClarity, 1 to 5:\n',
    ].join('\n'),
  )
  writeFileSync(
    `${OUT}/lessons-blind.md`,
    `# Blind review: lessons written from bench/data/lecture.md\n\nRead each lesson without knowing the model. Note every factual or mathematical error.\n\n${blind.join('\n\n---\n\n')}\n`,
  )
  writeFileSync(
    `${OUT}/lessons-key.json`,
    JSON.stringify(Object.fromEntries(shuffled.map((l, i) => [letters[i], l.model])), null, 2),
  )
  console.log(report)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

function installFakeClaude() {
  process.env.ANTHROPIC_API_KEY = 'dry-run'
  const part = (i: number) => ({
    concept: `Idea ${i + 1}`,
    narration: Array.from({ length: 100 }, () => 'word').join(' '),
    board: ['$P(A \\mid B)$', 'A short line'],
    check: { question: 'Why?', idealAnswer: 'Because.' },
  })
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    const system = JSON.stringify(body.system ?? '')
    const answer = system.includes('grading one check-in answer')
      ? { correct: true, feedback: 'ok', reexplanation: '', reexplanationBoard: [] }
      : system.includes('careful statistics tutor')
        ? { work: 'dry run', answer: 0.5 }
        : { title: 'Dry run', estimatedMinutes: 10, segments: [0, 1, 2, 3, 4].map(part) }
    const useTool = (body.tools ?? []).length > 0
    const content = useTool
      ? [{ type: 'tool_use', id: 't', name: body.tools[0].name, input: answer }]
      : [{ type: 'text', text: JSON.stringify(answer) }]
    await new Promise((r) => setTimeout(r, 5))
    return new Response(
      JSON.stringify({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content,
        stop_reason: useTool ? 'tool_use' : 'end_turn',
        usage: { input_tokens: 1000, output_tokens: 200 },
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
}
