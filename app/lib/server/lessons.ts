import 'server-only'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, Output, streamText } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { STATE_LABEL } from '../mastery'
import type { PageText } from '../skill-map'
import type { LectureSummary, LectureView, LessonMessage, MaterialRole } from '../views'
import { cleanOutline, type OutlineSection, type ReadingAnchor } from '../written-lesson'
import { describeStudent, MAX_SOURCE_CHARS, tracked, trackedTextStream } from './ai'
import { HttpError } from './auth'
import { loadLearning, materialInfos, materialPages } from './learning-data'
import { pagesForPrompt } from './learning'
import { normalizeMajor } from '../learning-styles'

// The written lesson of each lecture, and Ask Lyceo beside it. The outline is planned once from the lecture's pages
// and skill map; each section is written when the student reaches it and kept; Ask Lyceo answers with the section,
// the pages and what the student's answers so far say about each skill. Everything is read and written with the
// student's own session (row-level security); the model calls go through the daily limits.

export const LESSON_PROMPT_VERSION = 'lesson-v1'

export function lectureId(raw: string) {
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'That lecture does not exist.')
  return id
}
const MODEL = process.env.LYCEO_MODEL || 'claude-sonnet-4-6'

type DbResult<T> = { data: T | null; error: { message: string; code?: string } | null }
function must<T>(r: DbResult<T>): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

type MaterialRow = {
  id: number
  title: string
  kind: string
  academy_course_id: number | null
  status: string
  policy: 'study' | 'graded'
  failure: string | null
  role: MaterialRole
  sequence: number | null
  lecture_date: string | null
  created_at: string
  pages: { n: number; start: number }[] | null
}
const MATERIAL =
  'id, title, kind, academy_course_id, status, policy, failure, role, sequence, lecture_date, created_at, pages'

/** Lectures in the order the course gave them: the student's order, then the lecture date, then upload order. */
export function inCourseOrder<T extends { sequence: number | null; lecture_date: string | null; created_at: string }>(
  rows: T[],
) {
  return [...rows].sort(
    (a, b) =>
      (a.sequence ?? 1e9) - (b.sequence ?? 1e9) ||
      (a.lecture_date ?? '9999').localeCompare(b.lecture_date ?? '9999') ||
      a.created_at.localeCompare(b.created_at),
  )
}

export async function getLectureMaterial(db: SupabaseClient, userId: string, id: number) {
  const row = must(
    (await db
      .from('materials')
      .select(MATERIAL)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()) as DbResult<MaterialRow>,
  )
  if (!row) throw new HttpError(404, 'That lecture does not exist.')
  return row
}

/** Every material of a course for the sidebar, each lecture with its lesson's progress. */
export async function courseMaterials(db: SupabaseClient, courseId: number): Promise<LectureSummary[]> {
  const [materials, lessons] = await Promise.all([
    db.from('materials').select(MATERIAL).eq('academy_course_id', courseId) as unknown as Promise<
      DbResult<MaterialRow[]>
    >,
    db.from('material_lessons').select('material_id, outline, completed_sections, opened_at') as unknown as Promise<
      DbResult<
        { material_id: number; outline: OutlineSection[]; completed_sections: string[]; opened_at: string | null }[]
      >
    >,
  ])
  const progress = new Map(must(lessons).map((l) => [l.material_id, l]))
  return inCourseOrder(must(materials).filter((m) => m.status !== 'failed' && m.status !== 'pending')).map((m) => {
    const lesson = progress.get(m.id)
    return {
      id: m.id,
      title: m.title,
      role: m.role,
      sequence: m.sequence,
      lectureDate: m.lecture_date,
      status: m.status,
      sections: lesson?.outline.length ?? 0,
      completed: lesson?.completed_sections.length ?? 0,
      openedAt: lesson?.opened_at ?? null,
    }
  })
}

type LessonRow = {
  id: number
  outline: OutlineSection[]
  current_section: string | null
  completed_sections: string[]
  position: ReadingAnchor | null
}

async function lessonOf(db: SupabaseClient, materialId: number) {
  return must(
    (await db
      .from('material_lessons')
      .select('id, outline, current_section, completed_sections, position')
      .eq('material_id', materialId)
      .maybeSingle()) as DbResult<LessonRow>,
  )
}

/** The lecture as the learning environment shows it: its place in the course, its lesson, its conversation. */
export async function lectureView(
  db: SupabaseClient,
  userId: string,
  id: number,
  clock: { tz: string | null; today: string },
): Promise<LectureView> {
  const m = await getLectureMaterial(db, userId, id)
  const courseId = m.academy_course_id
  const [course, siblings, lesson, messages, learning] = await Promise.all([
    courseId === null
      ? Promise.resolve(null)
      : (
          db.from('academy_courses').select('name').eq('id', courseId).maybeSingle() as unknown as Promise<
            DbResult<{ name: string }>
          >
        ).then(must),
    courseId === null ? Promise.resolve([] as LectureSummary[]) : courseMaterials(db, courseId),
    lessonOf(db, id),
    db
      .from('lesson_messages')
      .select('id, role, content, context, created_at')
      .eq('material_id', id)
      .order('created_at')
      .limit(200) as unknown as Promise<
      DbResult<
        {
          id: number
          role: 'student' | 'lyceo'
          content: string
          context: LessonMessage['context']
          created_at: string
        }[]
      >
    >,
    loadLearning(db, { courseId, ...clock }),
  ])
  const sections = lesson
    ? must(
        (await db.from('lesson_sections').select('section_id, content').eq('lesson_id', lesson.id)) as DbResult<
          { section_id: string; content: string }[]
        >,
      )
    : []
  const lectures = siblings.filter((s) => s.role === 'lecture')
  const index = lectures.findIndex((l) => l.id === id)
  const skillIds = materialInfos(learning).find((x) => x.id === id)?.skillIds ?? []
  return {
    lecture: {
      id: m.id,
      title: m.title,
      role: m.role,
      status: m.status,
      policy: m.policy,
      failure: m.failure,
      pageCount: m.pages?.length ?? 0,
      courseId,
      courseName: course?.name ?? null,
      lectureDate: m.lecture_date,
    },
    number: index >= 0 ? index + 1 : null,
    total: lectures.length,
    prevId: index > 0 ? lectures[index - 1].id : null,
    nextId: index >= 0 && index + 1 < lectures.length ? lectures[index + 1].id : null,
    lesson: lesson
      ? {
          id: lesson.id,
          outline: lesson.outline,
          sections: Object.fromEntries(sections.map((s) => [s.section_id, s.content])),
          currentSection: lesson.current_section,
          completed: lesson.completed_sections,
          position: lesson.position,
        }
      : null,
    messages: must(messages).map((x) => ({
      id: x.id,
      role: x.role,
      content: x.content,
      context: x.context,
      createdAt: x.created_at,
    })),
    skills: skillIds
      .map((sid) => {
        const skill = learning.skills.get(sid)
        const st = learning.states.get(sid)
        return skill && st
          ? { id: sid, name: skill.name, state: st.state, label: STATE_LABEL[st.state], reason: st.reason }
          : null
      })
      .filter((s): s is NonNullable<typeof s> => s !== null),
  }
}

// ---------- the student, for the prompts ----------

async function studentNotes(db: SupabaseClient, userId: string, skills: LectureView['skills']) {
  const { data: profile } = await db.from('users').select('career, learning_style').eq('id', userId).maybeSingle()
  const about = describeStudent({
    styleId: profile?.learning_style ?? null,
    major: normalizeMajor(profile?.career),
    pace: 'steady',
    focusConcepts: [],
  })
  const memory = skills.length
    ? `What their answers so far show, skill by skill (use it to decide where to slow down; never quote it):\n${skills
        .map((s) => `- ${s.name}: ${s.label}. ${s.reason}`)
        .join('\n')}`
    : ''
  return [about, memory].filter(Boolean).join('\n\n')
}

const TEACHER = `You are Lyceo, a university tutor who teaches from the student's own lecture material. Write in clear, warm, precise English for a college student, even when the material is in another language. Math goes in LaTeX: inline between single dollar signs, like $M_X(t)$, and displayed equations on their own lines between $$ and $$. Never use a dollar sign for money; write USD.`

const FORMAT = `Format (it is rendered, so follow it exactly):
- Paragraphs separated by blank lines. **Bold** for a term the first time it is defined; *italic* sparingly.
- Displayed math: a line with $$, the equation, a line with $$ (or $$ ... $$ on one line).
- Lists with "- " or "1. ".
- Boxes: a line ":::definition Title", then its content, then a line ":::". Kinds: definition, theorem, example, note (a common mistake or a warning).
- Inside an example box, end with ":::takeaways" (2 to 4 short bullet points), closed by its own ":::" before the example's ":::".
- "### Subheading" for a sub-part. Never "#" or "##".
- Cite the lecture's pages in parentheses where you draw on them, like (p. 12).`

// ---------- the outline ----------

const outlineSchema = z.object({
  sections: z.array(
    z.object({
      title: z.string().describe('A short heading, like a textbook section: "The exponential distribution"'),
      goal: z.string().describe('One sentence: what the student will be able to do after it'),
      kind: z.enum(['foundations', 'concept', 'derivation', 'example', 'practice', 'summary']),
      skillIds: z.array(z.number()).describe('The ids of the skills this section teaches'),
      pages: z.array(z.number()).describe('The lecture pages it draws on'),
      minutes: z.number().describe('Reading time, 3 to 12'),
    }),
  ),
})

/** Plans the written lesson of a mapped lecture once; later calls return the same lesson. */
export async function ensureLesson(db: SupabaseClient, userId: string, materialId: number) {
  const existing = await lessonOf(db, materialId)
  if (existing) return existing
  const m = await getLectureMaterial(db, userId, materialId)
  if (m.status !== 'mapped') throw new HttpError(409, 'Lyceo hasn’t mapped this material yet.')
  const [pages, sources, course] = await Promise.all([
    materialPages(db, materialId),
    db.from('skill_sources').select('skill_id, locator').eq('material_id', materialId) as unknown as Promise<
      DbResult<{ skill_id: number; locator: { pages?: number[] } }[]>
    >,
    db
      .from('academy_courses')
      .select('name')
      .eq('id', m.academy_course_id ?? -1)
      .maybeSingle(),
  ])
  const located = must(sources)
  const skillRows = located.length
    ? must(
        (await db
          .from('skills')
          .select('id, name, objective, status')
          .in(
            'id',
            located.map((s) => s.skill_id),
          )) as DbResult<{ id: number; name: string; objective: string | null; status: string }[]>,
      ).filter((s) => s.status === 'active')
    : []
  const skillList = skillRows
    .map((s) => {
      const where = located.find((x) => x.skill_id === s.id)?.locator.pages ?? []
      return `- id ${s.id}: ${s.name}${s.objective ? `. Goal: ${s.objective}` : ''}${where.length ? ` (pages ${where.join(', ')})` : ''}`
    })
    .join('\n')

  const system = `${TEACHER}

Plan the written lesson that teaches this lecture to a student, in order. Between 3 and 8 sections:
- Start with the foundations the lecture builds on, if it assumes any.
- Then the lecture's ideas in a teachable order, each with its derivation where there is one, and worked examples.
- End with a short section that ties the ideas together.
Every skill below should be taught by at least one section. Only plan what the material supports.${m.policy === 'graded' ? '\nThis material is a graded assignment: plan lessons on the ideas it practices; never on solving its problems.' : ''}`
  const prompt = `Course: ${course.data?.name ?? 'Course'}
Lecture: ${m.title}

Skills mapped in this lecture:
${skillList || '(none)'}

The lecture:
${pagesForPrompt(pages)}`
  const maxOutputTokens = 2000
  const { output } = await tracked(
    'lesson-outline',
    MODEL,
    userId,
    { promptChars: system.length + prompt.length, maxOutputTokens },
    () =>
      generateText({
        model: anthropic(MODEL),
        system,
        prompt,
        maxOutputTokens,
        output: Output.object({ schema: outlineSchema }),
      }),
  )
  const outline = cleanOutline(output.sections, {
    skillIds: new Set(skillRows.map((s) => s.id)),
    pages: new Set(pages.map((p) => p.n)),
  })
  if (!outline.length) throw new HttpError(502, 'Lyceo couldn’t plan this lesson. Try again.')
  const inserted = await db
    .from('material_lessons')
    .insert({ material_id: materialId, outline, model: MODEL, prompt_version: LESSON_PROMPT_VERSION })
    .select('id, outline, current_section, completed_sections, position')
    .single()
  if (inserted.error?.code === '23505') return (await lessonOf(db, materialId))!
  return must(inserted as DbResult<LessonRow>)
}

/** The pages a section draws on, with a page of context on each side, cut to `limit` characters. */
function sectionPages(pages: PageText[], wanted: number[], limit: number) {
  if (!wanted.length) return pagesForPrompt(pages, limit)
  const keep = new Set(wanted.flatMap((n) => [n - 1, n, n + 1]))
  return pagesForPrompt(
    pages.filter((p) => keep.has(p.n)),
    limit,
  )
}

// ---------- a section ----------

/**
 * Writes one section of the lesson, streaming it to the browser, and keeps it. If it was written already, returns
 * it whole instead.
 */
export async function writeSection(
  db: SupabaseClient,
  userId: string,
  materialId: number,
  sectionId: string,
  clock: { tz: string | null; today: string },
): Promise<Response> {
  const lesson = await lessonOf(db, materialId)
  if (!lesson) throw new HttpError(409, 'Plan the lesson first.')
  const index = lesson.outline.findIndex((s) => s.id === sectionId)
  if (index < 0) throw new HttpError(404, 'That section is not in this lesson.')
  const { data: written } = await db
    .from('lesson_sections')
    .select('content')
    .eq('lesson_id', lesson.id)
    .eq('section_id', sectionId)
    .maybeSingle()
  if (written) return Response.json({ content: written.content })

  const section = lesson.outline[index]
  const [m, pages, view] = await Promise.all([
    getLectureMaterial(db, userId, materialId),
    materialPages(db, materialId),
    lectureView(db, userId, materialId, clock),
  ])
  const skills = view.skills.filter((s) => section.skillIds.includes(s.id))
  const previous = index > 0 ? view.lesson?.sections[lesson.outline[index - 1].id] : undefined
  const notes = await studentNotes(db, userId, skills)
  const system = `${TEACHER}

You are writing one section of a thorough written lesson. Teach it the way an excellent professor's notes would:
- Build from what the student already has. Define every term before using it.
- Derive results step by step, showing the algebra a student would need and saying why each step holds. Do not skip steps that the lecture skips; fill them in.
- Work at least one example with numbers through to the end, when the idea allows it.
- Point out the mistake students most often make with this idea.
- Use the lecture's notation and stay faithful to what it says; where you go beyond it, say so.
- Length: as long as the section needs, usually 600 to 1600 words. No summary of what you are about to do, no closing questions: practice comes separately.${m.policy === 'graded' ? '\n- This material is a graded assignment: teach the ideas with your own examples, and never solve or restate its problems.' : ''}

${FORMAT}

${notes}`
  const outline = lesson.outline
    .map((s, i) => `${i + 1}. ${s.title}${s.id === sectionId ? '   <- write this one' : ''}`)
    .join('\n')
  const prompt = `Lecture: ${m.title}
The lesson's sections:
${outline}

This section: ${section.title}
Its goal: ${section.goal}
${skills.length ? `Skills it teaches: ${skills.map((s) => s.name).join('; ')}` : ''}
${previous ? `\nThe end of the previous section, to continue from:\n${previous.slice(-1500)}\n` : ''}
The lecture's pages for this section:
${sectionPages(pages, section.pages, Math.min(MAX_SOURCE_CHARS, 40_000))}

Write the section's content now (not its title, which is shown above it).`
  const maxOutputTokens = 5000

  return trackedTextStream({
    task: 'lesson-section',
    model: MODEL,
    userId,
    promptChars: system.length + prompt.length,
    maxOutputTokens,
    start: (abortSignal, onError) =>
      streamText({
        model: anthropic(MODEL),
        system,
        prompt,
        maxOutputTokens,
        abortSignal,
        onError: ({ error }) => onError(error),
      }),
    onDone: async (text) => {
      const saved = await db
        .from('lesson_sections')
        .insert({ lesson_id: lesson.id, section_id: sectionId, content: text.trim().slice(0, 60_000), model: MODEL })
      // Written meanwhile by another request: keep that one.
      if (saved.error && saved.error.code !== '23505') throw new Error(saved.error.message)
      if (!lesson.current_section)
        await db.from('material_lessons').update({ current_section: sectionId }).eq('id', lesson.id)
    },
  })
}

// ---------- Ask Lyceo ----------

/**
 * Answers a question beside the lesson, streaming it, and keeps both sides of the conversation. A question about a
 * passage carries the passage. The answer draws on the section being read, the lecture's pages and what the
 * student's answers so far show.
 */
export async function askLyceo(
  db: SupabaseClient,
  userId: string,
  materialId: number,
  ask: { message: string; context: { sectionId?: string; quote?: string } | null },
  clock: { tz: string | null; today: string },
): Promise<Response> {
  const message = ask.message.trim().slice(0, 4000)
  if (!message) throw new HttpError(400, 'Write a question first.')
  const context =
    ask.context && (ask.context.quote || ask.context.sectionId)
      ? {
          sectionId: ask.context.sectionId?.slice(0, 40),
          quote: ask.context.quote?.replace(/\s+/g, ' ').trim().slice(0, 1500),
        }
      : null
  const [m, view, pages] = await Promise.all([
    getLectureMaterial(db, userId, materialId),
    lectureView(db, userId, materialId, clock),
    materialPages(db, materialId),
  ])
  const saved = await db
    .from('lesson_messages')
    .insert({ material_id: materialId, role: 'student', content: message, context })
  if (saved.error) throw new Error(saved.error.message)

  const lesson = view.lesson
  const sectionId = context?.sectionId ?? lesson?.currentSection ?? lesson?.outline[0]?.id
  const section = lesson?.outline.find((s) => s.id === sectionId)
  const sectionText = sectionId ? lesson?.sections[sectionId] : undefined
  const notes = await studentNotes(db, userId, view.skills)
  const system = `${TEACHER}

You are "Ask Lyceo", the course assistant beside the lesson the student is reading. They ask without leaving the lesson.
- Answer the question they asked, at the depth they asked for: usually 60 to 250 words; a derivation when they ask for one.
- When they quote a passage, explain that passage first.
- Use the lecture's notation and the lesson's wording. If the answer goes beyond the lecture, say so briefly.
- Never write out answers to a graded assignment's problems: explain the idea and let them do the work.
- Markdown: **bold** sparingly, short lists when they help, displayed math between $$ lines. No headings.

${notes}`
  const background = `Lecture: ${m.title}
${lesson ? `The lesson's sections: ${lesson.outline.map((s) => s.title).join(' | ')}` : ''}
${section ? `The student is reading: ${section.title}` : ''}
${sectionText ? `\nThat section's text:\n${sectionText.slice(0, 9000)}\n` : ''}
The lecture's pages:
${sectionPages(pages, section?.pages ?? [], 14_000)}`
  const history = view.messages.slice(-12).map((x) => ({
    role: x.role === 'student' ? ('user' as const) : ('assistant' as const),
    content:
      x.role === 'student' && x.context?.quote ? `About this passage: "${x.context.quote}"\n\n${x.content}` : x.content,
  }))
  const question = context?.quote ? `About this passage: "${context.quote}"\n\n${message}` : message
  const messages = [
    { role: 'user' as const, content: `Background for this conversation (not from the student):\n${background}` },
    { role: 'assistant' as const, content: 'Understood. I will answer from this lecture.' },
    ...history,
    { role: 'user' as const, content: question },
  ]
  const maxOutputTokens = 1500
  return trackedTextStream({
    task: 'ask-lyceo',
    model: MODEL,
    userId,
    promptChars: system.length + messages.reduce((n, x) => n + x.content.length, 0),
    maxOutputTokens,
    start: (abortSignal, onError) =>
      streamText({
        model: anthropic(MODEL),
        system,
        messages,
        maxOutputTokens,
        abortSignal,
        onError: ({ error }) => onError(error),
      }),
    onDone: async (text) => {
      const answer = await db
        .from('lesson_messages')
        .insert({ material_id: materialId, role: 'lyceo', content: text.trim().slice(0, 20_000), context: null })
      if (answer.error) throw new Error(answer.error.message)
    },
  })
}
