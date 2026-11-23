import 'server-only'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { Facet } from '../mastery'
import type { GeneratedQuestion } from '../questions'
import type { PageText, ProposedIdea } from '../skill-map'
import type { PlannedQuestion } from '../study'
import { MAX_SOURCE_CHARS, tracked } from './ai'

// The model calls of the learning loop: the skill map of a material, the questions of a Quick Check, and the
// explanation and new problem after a wrong answer. Every call goes through tracked(), so it's reserved against the
// daily limits first and its cost is recorded against the study session.

const MODEL = process.env.LYCEO_MODEL || 'claude-sonnet-4-6'

const TUTOR = `You are Theo, the tutor inside Lyceo. You teach from the student's own course material: their slides and notes. Write in clear, friendly English for a college student, even when the material is in another language. Math goes in LaTeX between single dollar signs, like $P(A \\mid B)$. Never use a dollar sign for money; write USD. Plain text only: no markdown, no asterisks or underscores for emphasis, no headings, no bullet lists.`

/** Pages with their numbers, cut to the source limit. Pages past the limit are left out and say so. */
export function pagesForPrompt(pages: PageText[], limit = MAX_SOURCE_CHARS) {
  let used = 0
  const parts: string[] = []
  for (const p of pages) {
    const block = `--- Page ${p.n} ---\n${p.text}`
    if (used + block.length > limit) {
      parts.push(`--- Pages ${p.n} to ${pages[pages.length - 1].n} were left out (too long) ---`)
      break
    }
    parts.push(block)
    used += block.length
  }
  return parts.join('\n\n')
}

// ---------- the skill map ----------

const mapSchema = z.object({
  ideas: z.array(
    z.object({
      name: z.string().describe('2 to 6 words, the way a syllabus would name it, e.g. "Bayes\' rule"'),
      objective: z.string().describe('One sentence: what the student should be able to do, starting with a verb'),
      facets: z
        .array(z.enum(['conceptual', 'procedural', 'application']))
        .describe(
          'conceptual: explain or recognize it. procedural: carry out its steps. application: use it in a new situation',
        ),
      pages: z.array(z.number()).describe('Pages where the material teaches it'),
      quote: z
        .string()
        .describe('6 to 25 consecutive words copied exactly from one of those pages. Empty if no sentence states it'),
      sameAsExistingId: z
        .number()
        .nullable()
        .describe('The id of the course skill that is the same idea, or null if it is new'),
    }),
  ),
})

export async function proposeSkillMap(opts: {
  title: string
  courseName: string
  pages: PageText[]
  existing: { id: number; name: string; objective: string | null }[]
  graded: boolean
  userId: string
}): Promise<ProposedIdea[]> {
  const system = `${TUTOR}

You are mapping one material of a student's course into the ideas they will be quizzed on.
- An idea is something the student can be asked to do or explain, not a heading: "Compute conditional probabilities", not "Introduction".
- Most lectures have 3 to 8 ideas; short material can have 1 or 2. Never more than 10. Skip logistics, announcements and examples that teach nothing new.
- Only ideas this material actually teaches. If an idea is clearly central but never stated in a sentence, include it with an empty quote.
- quote: copy 6 to 25 consecutive words exactly as they appear on one of the cited pages. No paraphrase, no ellipsis.
- If an idea is the same as one already in the course (same skill, even if named differently), give that skill's id in sameAsExistingId and keep its meaning. Different ideas that merely share a topic are not the same.${opts.graded ? '\n- This material is from a graded assignment. Map the ideas it practices; never restate its problems as ideas.' : ''}`
  const existing = opts.existing.length
    ? opts.existing.map((s) => `- id ${s.id}: ${s.name}${s.objective ? ` (${s.objective})` : ''}`).join('\n')
    : '(none yet)'
  const prompt = `Course: ${opts.courseName}
Skills already in the course:
${existing}

Material: ${opts.title}
${pagesForPrompt(opts.pages)}`
  const maxOutputTokens = 2500
  const { output } = await tracked(
    'map-skills',
    MODEL,
    opts.userId,
    { promptChars: system.length + prompt.length, maxOutputTokens },
    () =>
      generateText({
        model: anthropic(MODEL),
        system,
        prompt,
        maxOutputTokens,
        output: Output.object({ schema: mapSchema }),
      }),
  )
  return output.ideas
}

// ---------- questions ----------

const questionSchema = z.object({
  format: z.enum(['choice', 'number', 'short_text']),
  prompt: z.string().describe('The question, self-contained. Never contains its answer'),
  choices: z.array(z.string()).describe('choice: exactly 4 options without letters. Otherwise empty'),
  answer: z
    .string()
    .describe('choice: the letter of the right option. number: the number alone. short_text: a model answer'),
  tolerance: z.number().nullable().describe('number: how far off still counts, in the same units. Otherwise null'),
  rubric: z
    .array(z.object({ point: z.string(), required: z.boolean() }))
    .describe('short_text: 1 to 3 points a complete answer shows. Otherwise empty'),
  mistakes: z
    .array(z.object({ answer: z.string(), why: z.string().describe('The mistake, 2 to 8 words') }))
    .describe('number: up to 3 wrong answers that common mistakes produce. Otherwise empty'),
  hints: z.array(z.string()).describe('1 or 2 hints, each a nudge that does not give the answer away'),
  solution: z.string().describe('The worked solution in 2 to 4 sentences'),
  page: z.number().nullable().describe('The page of the material this practices'),
})

const DIFFICULTY = {
  1: 'easy (one step, recall or direct use)',
  2: 'medium (two or three steps)',
  3: 'hard (several steps or a less familiar setting)',
}
const FACET_TEXT: Record<Facet, string> = {
  conceptual: 'conceptual: explain, recognize or compare',
  procedural: 'procedural: carry out the method',
  application: 'application: use the idea in a new, realistic situation',
}

export type SkillContext = {
  id: number
  name: string
  objective: string | null
  excerpts: { materialId: number; page: number; text: string; quote: string | null }[]
}

function skillBlock(s: SkillContext) {
  const excerpts = s.excerpts
    .map((e) => `  [page ${e.page}]${e.quote ? ` key sentence: "${e.quote}"` : ''}\n  ${e.text.replace(/\n/g, '\n  ')}`)
    .join('\n')
  return `Skill ${s.id}: ${s.name}${s.objective ? `\nGoal: ${s.objective}` : ''}\nFrom the student's material:\n${excerpts || '  (no page text)'}`
}

const QUESTION_RULES = (graded: boolean) => `Question rules:
- Write your own problems. Test the idea, not the wording of the slides.${graded ? '\n- This material is from a graded assignment: never reproduce, solve or closely paraphrase its problems.' : ''}
- choice: 4 options, exactly one right, wrong options built from real misconceptions. Prefer number or choice when the idea allows it, so the answer can be checked exactly.
- number: the answer is one number (decimal, not a fraction or percent sign); say in the prompt how to round if it matters.
- short_text: answerable in one to three sentences.
- The prompt never contains or implies its answer. Hints nudge the next step and never state the answer.`

export async function writeQuestions(opts: {
  plan: PlannedQuestion[]
  skills: Map<number, SkillContext>
  graded: boolean
  userId: string
  studySessionId: number
}): Promise<GeneratedQuestion[]> {
  const system = `${TUTOR}

You write a short Quick Check: a few questions the student answers one at a time, to see what they can do without help.
${QUESTION_RULES(opts.graded)}
- Write exactly one question per slot, in slot order, at the slot's difficulty and kind.`
  const used = [...new Set(opts.plan.map((p) => p.skillId))]
  const prompt = `${used.map((id) => skillBlock(opts.skills.get(id)!)).join('\n\n')}

Slots:
${opts.plan.map((p, i) => `${i + 1}. Skill ${p.skillId}, ${DIFFICULTY[p.difficulty]}, ${FACET_TEXT[p.facet]}`).join('\n')}`
  const maxOutputTokens = 900 * opts.plan.length + 400
  const { output } = await tracked(
    'write-questions',
    MODEL,
    opts.userId,
    { promptChars: system.length + prompt.length, maxOutputTokens, studySessionId: opts.studySessionId },
    () =>
      generateText({
        model: anthropic(MODEL),
        system,
        prompt,
        maxOutputTokens,
        output: Output.object({ schema: z.object({ questions: z.array(questionSchema) }) }),
      }),
  )
  return output.questions
}

// ---------- teaching ----------

const explanationSchema = z.object({
  explanation: z
    .string()
    .describe(
      'At most 80 words in 3 to 5 short sentences, starting from what their answer shows. No new question, no list',
    ),
  page: z.number().nullable().describe('The page of the material the explanation draws on'),
  quote: z.string().describe('6 to 25 consecutive words copied exactly from that page, or empty'),
  inMaterial: z.boolean().describe('False if the idea does not appear in the material excerpts at all'),
})

export async function writeExplanation(opts: {
  skill: SkillContext
  question: { prompt: string; choices?: string[] }
  answer: string
  verdict: 'incorrect' | 'partial'
  mistake: string | null
  solution: string
  round: 1 | 2
  userId: string
  studySessionId: number
}) {
  const angle =
    opts.round === 1
      ? 'Explain the idea from the mistake their answer shows.'
      : 'This is the second explanation: the first one did not land. Take a different angle: a short worked example with concrete numbers.'
  const verdictLine =
    opts.verdict === 'partial'
      ? 'The answer was partly right: say in one sentence what was right, then explain the part that was missing.'
      : 'The answer was wrong (or the student did not know). Do not scold; start from what they likely thought.'
  const system = `${TUTOR}

A student just missed a question in a Quick Check. Write a short explanation that teaches the idea, grounded in their own material.
- ${verdictLine}
- ${angle}
- Use the material's own terms and notation. Cite the page you draw on and copy a short quote from it exactly.
- If the idea is not in the excerpts, say so plainly in the explanation ("Your slides don't cover this directly, so...") and set inMaterial to false.
- Don't pose a new question: a new problem comes right after, written separately.`
  const prompt = `${skillBlock(opts.skill)}

Question: ${opts.question.prompt}
${opts.question.choices?.length ? `Choices: ${opts.question.choices.map((c, i) => `${'ABCDE'[i]}. ${c}`).join(' | ')}\n` : ''}Student's answer: <answer>${opts.answer.slice(0, 1500)}</answer>
${opts.mistake ? `The grader's note on the mistake: ${opts.mistake}\n` : ''}Worked solution: ${opts.solution}`
  const maxOutputTokens = 600
  const { output } = await tracked(
    'explain',
    MODEL,
    opts.userId,
    { promptChars: system.length + prompt.length, maxOutputTokens, studySessionId: opts.studySessionId },
    () =>
      generateText({
        model: anthropic(MODEL),
        system,
        prompt,
        maxOutputTokens,
        output: Output.object({ schema: explanationSchema }),
      }),
  )
  return output
}

export async function writePractice(opts: {
  skill: SkillContext
  slot: PlannedQuestion
  explanation: string
  previous: string
  graded: boolean
  userId: string
  studySessionId: number
}): Promise<GeneratedQuestion> {
  const system = `${TUTOR}

A student missed a question and has just read an explanation. Write one new practice problem on the same skill, so they use what the explanation taught instead of repeating it.
${QUESTION_RULES(opts.graded)}
- The answer must not be findable by matching words from the explanation or from the question they missed. Change the setting and the wording, and never reuse the explanation's defining phrase as the scenario.
- Make the student use the idea: apply it to a new case, compute with it, or tell it apart from the idea it is most often confused with (for example: which scenario does NOT use it, or why it fits better than a close alternative).
- Never the same problem, and not the same problem with new numbers when a different setting is possible.
- ${DIFFICULTY[opts.slot.difficulty]}; ${FACET_TEXT[opts.slot.facet]}.`
  const prompt = `${skillBlock(opts.skill)}

The question they missed: ${opts.previous}

The explanation they just read: ${opts.explanation}`
  const maxOutputTokens = 1000
  const { output } = await tracked(
    'write-practice',
    MODEL,
    opts.userId,
    { promptChars: system.length + prompt.length, maxOutputTokens, studySessionId: opts.studySessionId },
    () =>
      generateText({
        model: anthropic(MODEL),
        system,
        prompt,
        maxOutputTokens,
        output: Output.object({
          schema: questionSchema.extend({
            differsBy: z
              .string()
              .describe(
                'One sentence, not shown to the student: what the problem makes them do beyond the explanation',
              ),
          }),
        }),
      }),
  )
  return output
}

// ---------- Guided Review ----------

const guidedSchema = z.object({
  explanations: z.array(
    z.object({
      skillId: z.number(),
      explanation: z
        .string()
        .describe('At most 100 words: the idea in plain words, how to use it, and one common mistake to avoid'),
      page: z.number().nullable().describe('The page of the material it draws on'),
      quote: z.string().describe('6 to 25 consecutive words copied exactly from that page, or empty'),
    }),
  ),
})

/** One explanation per skill, to read before practicing it. One call for all of them. */
export async function writeGuidedExplanations(opts: {
  skills: SkillContext[]
  userId: string
  studySessionId: number
}) {
  const system = `${TUTOR}

A student is doing a Guided Review: for each skill they first read a short explanation from their own material, then practice it.
- One explanation per skill, in the order given. Teach the idea; don't quiz.
- Use the material's terms and notation. Cite the page you draw on and copy a short quote from it exactly.
- If a skill isn't in the excerpts, say so plainly ("Your slides don't cover this directly, so...").`
  const prompt = opts.skills.map(skillBlock).join('\n\n')
  const maxOutputTokens = 500 * opts.skills.length + 300
  const { output } = await tracked(
    'guided-explain',
    MODEL,
    opts.userId,
    { promptChars: system.length + prompt.length, maxOutputTokens, studySessionId: opts.studySessionId },
    () =>
      generateText({
        model: anthropic(MODEL),
        system,
        prompt,
        maxOutputTokens,
        output: Output.object({ schema: guidedSchema }),
      }),
  )
  return output.explanations
}
