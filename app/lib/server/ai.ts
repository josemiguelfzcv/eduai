import 'server-only'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { Lesson, Personalization, Segment } from '../lesson'
import { getStyle } from '../learning-styles'
import { recordUsage, tokensFromSdk } from './usage'

const MODEL_ID = process.env.LYCEO_MODEL || 'claude-sonnet-4-6'
/** Grading can move to a different model once the benchmark shows it's as good (see bench/). */
const GRADE_MODEL_ID = process.env.LYCEO_GRADE_MODEL || MODEL_ID

/** Runs one Claude call and logs its tokens, cost and latency, whether it succeeds or fails. */
async function tracked<T extends { usage: Parameters<typeof tokensFromSdk>[0] }>(
  task: string,
  model: string,
  userId: string | null | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const started = Date.now()
  try {
    const result = await run()
    recordUsage({
      task,
      provider: 'anthropic',
      model,
      latencyMs: Date.now() - started,
      ok: true,
      tokens: tokensFromSdk(result.usage),
      userId,
    })
    return result
  } catch (err) {
    recordUsage({ task, provider: 'anthropic', model, latencyMs: Date.now() - started, ok: false, userId })
    throw err
  }
}

/** Longest slice of source material sent to the model (about 20k tokens). */
export const MAX_SOURCE_CHARS = 80_000

const THEO = `You are Theo, the tutor inside Lyceo. You're in your early twenties, warm, encouraging and a little funny, and you explain things the way the best TA does in office hours. You teach from the student's own course material and don't wander off into tangents.`

const LESSON_RULES = `The lesson is delivered in segments. In each segment a text-to-speech voice reads the narration while short notes appear on a chalkboard, and then the student answers one check question.

Narration:
- Plain spoken English, 80 to 170 words per segment, speaking to the student as "you".
- No LaTeX, symbols, markdown or lists. Say math the way you'd say it out loud ("x squared", "the probability of A given B").
- Refer to the board when it helps ("look at the board").

Board:
- 2 to 5 short lines per segment, each under 60 characters.
- Math goes in LaTeX between single dollar signs, like $P(A \\mid B)$. Use $$...$$ for at most one key formula per segment.
- Never use a dollar sign for money; write USD instead.

Check question:
- One per segment, answerable in a sentence, a number or a short expression.
- It tests the segment's main idea, not trivia. Include a short ideal answer.

Always write in English, even when the material is in another language.`

const PACE_RULES: Record<Personalization['pace'], string> = {
  gentle:
    'This student has been missing check-ins lately. Use smaller steps and 6 to 8 segments, open each segment with a one-sentence recap, and keep each check question to a single idea.',
  steady: 'Use a normal pace: 4 to 7 segments depending on how much material there is.',
  brisk:
    'This student gets most check-ins right on the first try. Move briskly with 4 to 6 segments, skip the obvious, and make check questions apply the idea to a new case.',
}

export function describeStudent(p: Personalization) {
  const style = getStyle(p.styleId)
  const lines = [
    p.major ? `- Major: ${p.major}. Use examples from this field when they fit naturally.` : null,
    style ? `- How they like to learn: ${style.teach}` : null,
    `- Pace: ${PACE_RULES[p.pace]}`,
    p.focusConcepts.length
      ? `- Concepts they needed help with recently: ${p.focusConcepts.join('; ')}. If any of these come up in this material, slow down and explain them from a fresh angle. Otherwise ignore this.`
      : null,
  ].filter(Boolean)
  return `About this student:\n${lines.join('\n')}`
}

const segmentSchema = z.object({
  concept: z.string().describe('Name of the concept, 2 to 6 words'),
  narration: z.string().describe('What Theo says out loud, plain spoken English, no LaTeX'),
  board: z.array(z.string()).describe('2 to 5 short chalkboard lines, math in $...$'),
  check: z.object({
    question: z.string(),
    idealAnswer: z.string(),
  }),
})

const lessonSchema = z.object({
  title: z.string().describe('Short, specific lesson title'),
  estimatedMinutes: z.number().describe('Whole minutes'),
  segments: z.array(segmentSchema),
})

function clean(lesson: z.infer<typeof lessonSchema>) {
  return {
    ...lesson,
    estimatedMinutes: Math.max(1, Math.round(lesson.estimatedMinutes) || lesson.segments.length * 2),
    segments: lesson.segments
      .filter((s) => s.narration.trim())
      .map((s) => ({
        ...s,
        board: s.board
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 6),
      })),
  }
}

export async function writeLesson(opts: {
  courseTitle: string
  material: string
  student: Personalization
  model?: string
  userId?: string | null
}): Promise<Omit<Lesson, 'meta'>> {
  const model = opts.model ?? MODEL_ID
  const { output } = await tracked('lesson', model, opts.userId, () =>
    generateText({
      model: anthropic(model),
      system: `${THEO}\n\n${LESSON_RULES}`,
      output: Output.object({ schema: lessonSchema }),
      maxOutputTokens: 8000,
      prompt: `Write a lesson that teaches the most important ideas in this course material.

Course: ${opts.courseTitle || 'Not given'}

${describeStudent(opts.student)}

Material:
<material>
${opts.material.slice(0, MAX_SOURCE_CHARS)}
</material>`,
    }),
  )
  const lesson = clean(output)
  if (!lesson.segments.length) throw new Error('The model returned an empty lesson')
  return lesson
}

export async function writeReview(opts: {
  courseTitle: string
  missed: { segment: Segment; wrongAnswers: string[] }[]
  student: Personalization
  model?: string
  userId?: string | null
}): Promise<Omit<Lesson, 'meta'>> {
  const model = opts.model ?? MODEL_ID
  const style = getStyle(opts.student.styleId)
  const missed = opts.missed
    .map(
      ({ segment, wrongAnswers }, i) => `Concept ${i + 1}: ${segment.concept}
How it was explained before: ${segment.narration}
Board before: ${segment.board.join(' | ')}
Check question: ${segment.check.question}
What the student answered: ${wrongAnswers.map((a) => `"${a}"`).join(', ') || 'no answer recorded'}`,
    )
    .join('\n\n')

  const { output } = await tracked('review', model, opts.userId, () =>
    generateText({
      model: anthropic(model),
      system: `${THEO}\n\n${LESSON_RULES}`,
      output: Output.object({ schema: lessonSchema }),
      maxOutputTokens: 6000,
      prompt: `Write a short review lesson (one segment per concept, at most 4) for the concepts below, which the student did not get on the first try in "${opts.courseTitle}".
Explain each one from a different angle than before${style ? ` (${style.fallback})` : ''}, address the misunderstanding their answers show, and write a new check question.

${describeStudent(opts.student)}

${missed}`,
    }),
  )
  const lesson = clean(output)
  if (!lesson.segments.length) throw new Error('The model returned an empty review')
  return lesson
}

const gradeSchema = z.object({
  correct: z.boolean(),
  feedback: z.string().describe('1 or 2 sentences reacting to what the student actually wrote'),
  reexplanation: z
    .string()
    .describe('If incorrect: 60 to 120 words of spoken English from a new angle, no LaTeX. If correct: empty string'),
  reexplanationBoard: z
    .array(z.string())
    .describe('If incorrect: 1 to 3 board lines, math in $...$. If correct: empty'),
})

export type Grade = z.infer<typeof gradeSchema>

export async function gradeAnswer(opts: {
  segment: Segment
  answer: string
  styleId: string | null
  missedBefore: number
  model?: string
  userId?: string | null
}): Promise<Grade> {
  const { segment, answer } = opts
  const model = opts.model ?? GRADE_MODEL_ID
  const style = getStyle(opts.styleId)
  const angle = style
    ? style.fallback
    : 'Use a different approach than the original explanation, such as a concrete example with numbers or an analogy.'

  const { output } = await tracked('grade', model, opts.userId, () =>
    generateText({
      model: anthropic(model),
      system: `${THEO}

You are grading one check-in answer in a one-on-one lesson.
- Be fair: accept answers that show the right idea even if they're loosely worded or have small slips. Numbers within rounding count.
- Feedback reacts to what the student actually wrote, warmly and specifically. Light humor is welcome; never be mean. If the answer is a guess, "idk" or nonsense, call it out kindly.
- If the answer is wrong, re-explain the idea from a different angle than before and connect it to what they wrote. ${angle}
- Spoken text has no LaTeX or symbols. Board lines put math in $...$.
- If the answer is correct, leave the re-explanation empty.`,
      output: Output.object({ schema: gradeSchema }),
      maxOutputTokens: 1500,
      prompt: `Concept: ${segment.concept}
How it was explained: ${segment.narration}
Board: ${segment.board.join(' | ')}
Question: ${segment.check.question}
Ideal answer: ${segment.check.idealAnswer || 'Not provided; judge from the explanation.'}
${opts.missedBefore > 0 ? `The student has already missed this question ${opts.missedBefore} time(s), so try a noticeably different explanation.\n` : ''}
Student's answer: <answer>${answer}</answer>`,
    }),
  )
  return {
    ...output,
    reexplanation: output.correct ? '' : output.reexplanation.trim(),
    reexplanationBoard: output.correct ? [] : output.reexplanationBoard.filter(Boolean).slice(0, 4),
  }
}
