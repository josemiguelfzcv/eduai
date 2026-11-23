import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import { writeExplanation, writePractice } from '../../../../lib/server/learning'
import {
  loadSession,
  requireLearningLoop,
  skillContexts,
  type SkillRow,
  type SourceRow,
} from '../../../../lib/server/learning-data'
import { addItems, itemForGrading, type NewItem } from '../../../../lib/server/records'
import { clientClock, sessionId, sessionView } from '../../../../lib/server/sessions'
import { plainText, tooClose, toItem } from '../../../../lib/questions'
import { citation } from '../../../../lib/skill-map'
import { MAX_ROUNDS, roundsUsed, type PlannedQuestion } from '../../../../lib/study'

export const maxDuration = 90

type Context = { params: Promise<{ id: string }> }

/**
 * After a wrong or partly right answer: an explanation grounded in the student's material, then a new problem on the
 * same skill, written separately so the explanation never carries the next answer. At most two rounds per skill in a
 * session; the second explanation takes another angle. Asking twice returns what was already written.
 */
export async function POST(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = sessionId((await context.params).id)
    const body = await req.json()
    const clock = clientClock(body)
    const itemId = String(body.itemId ?? '')

    const session = await loadSession(db, id)
    if (session.status !== 'active') throw new HttpError(409, 'That session has already ended.')
    const item = session.items.find((i) => i.id === itemId && i.type === 'question')
    if (!item) throw new HttpError(404, 'That question is not in this session.')
    if (session.items.some((i) => i.follows === itemId))
      return NextResponse.json({ view: await sessionView(db, user.id, id, clock) })
    const used = roundsUsed(session.items, item.skill_id)
    if (used >= MAX_ROUNDS) throw new HttpError(409, 'That’s all the explanations for this idea today.')

    const k = await itemForGrading(user.id, id, itemId)
    if (!k.answered) throw new HttpError(409, 'Answer the question first.')
    const { data: events, error } = await db
      .from('session_events')
      .select('id, verdict, answer, error_tag')
      .eq('study_session_id', id)
      .eq('item_id', itemId)
      .order('id', { ascending: false })
      .limit(1)
    if (error) throw error
    const last = events?.[0]
    if (!last || (last.verdict !== 'incorrect' && last.verdict !== 'partial'))
      throw new HttpError(409, 'That answer doesn’t need an explanation.')

    const [{ data: skill }, { data: sources }] = await Promise.all([
      db
        .from('skills')
        .select('id, academy_course_id, name, objective, facets, status, merged_into, confirmed_at, created_at')
        .eq('id', item.skill_id)
        .maybeSingle<SkillRow>(),
      db
        .from('skill_sources')
        .select('id, skill_id, material_id, lesson_id, locator, quote, origin')
        .eq('skill_id', item.skill_id),
    ])
    if (!skill) throw new HttpError(404, 'That idea is no longer in your course.')
    const contexts = await skillContexts(db, [skill], (sources ?? []) as SourceRow[], { pagesPerSkill: 3 })
    const ctx = contexts.get(skill.id)!
    const materialIds = ctx.excerpts.map((e) => e.materialId)
    const { data: graded } = materialIds.length
      ? await db.from('materials').select('id').in('id', materialIds).eq('policy', 'graded')
      : { data: [] }

    const round = (used + 1) as 1 | 2
    const explained = await writeExplanation({
      skill: ctx,
      question: { prompt: item.prompt, choices: item.choices },
      answer: last.answer ?? '',
      verdict: last.verdict,
      mistake: last.error_tag,
      solution: k.key.solution,
      round,
      userId: user.id,
      studySessionId: id,
    })

    // The citation is kept only if its words are really on that page of the student's material.
    const sources_ = citation(ctx.excerpts, explained.page, explained.quote)

    const explanationText = plainText(explained.explanation).trim().slice(0, 3000)
    // Same skill, same or lower difficulty, and where the skill allows it, another angle than the missed question:
    // a recognition question is followed by one that applies or carries out the idea.
    const otherAngle = (skill.facets ?? []).find((f) => f !== item.facet && f !== 'conceptual')
    const slot: PlannedQuestion = {
      skillId: item.skill_id,
      difficulty: Math.max(1, round === 2 ? item.difficulty - 1 : item.difficulty) as 1 | 2 | 3,
      facet: item.facet === 'conceptual' && otherAngle ? otherAngle : item.facet,
    }
    // Up to two tries for a problem that can be graded and that makes the student use the idea: one sharing a run of
    // words with the explanation or the missed question would be answered by matching words. If both tries are too
    // close, the last one that can be graded is used rather than none.
    let practice: NewItem | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const written = await writePractice({
        skill: ctx,
        slot,
        explanation: explanationText,
        previous: item.prompt,
        graded: (graded ?? []).length > 0,
        userId: user.id,
        studySessionId: id,
      })
      const candidate = toItem(`p-${itemId}`, slot, written, { follows: itemId, round })
      if (!candidate) continue
      practice = candidate
      if (!tooClose(candidate.prompt, explanationText) && !tooClose(candidate.prompt, item.prompt)) break
    }
    const explanation: NewItem = {
      id: `x-${itemId}`,
      type: 'explanation',
      skillId: item.skill_id,
      difficulty: slot.difficulty,
      facet: slot.facet,
      prompt: explanationText,
      sources: sources_,
      follows: itemId,
      round,
    }
    try {
      await addItems(user.id, id, practice ? [explanation, practice] : [explanation])
    } catch (err) {
      // Written meanwhile by another request for the same answer: show that one.
      if (!(err instanceof HttpError && err.status === 409)) throw err
    }
    return NextResponse.json({ view: await sessionView(db, user.id, id, clock) })
  } catch (err) {
    return errorResponse(err, 'Could not write the explanation. You can go on to the next question.')
  }
}
