import { NextRequest, NextResponse } from 'next/server'
import { assertOwnCourse } from '../../lib/server/academy'
import { errorResponse, HttpError, requireUser } from '../../lib/server/auth'
import { writeGuidedExplanations, writeQuestions } from '../../lib/server/learning'
import {
  loadLearning,
  materialInfos,
  requireLearningLoop,
  skillContexts,
  type SkillRow,
} from '../../lib/server/learning-data'
import { addItems, finishSession, startSession, type NewItem } from '../../lib/server/records'
import { clientClock } from '../../lib/server/sessions'
import { POLICY_VERSION, type SkillStateName } from '../../lib/mastery'
import { toItem } from '../../lib/questions'
import { citation } from '../../lib/skill-map'
import { MIN_QUESTIONS, planQuestions } from '../../lib/study'

export const maxDuration = 120

/** Most urgent first; confirmed skills only come in when asked for. */
const URGENCY: Record<SkillStateName, number> = { needs_practice: 0, learning: 1, new: 2, review: 3, confirmed: 9 }

/** Skills in a Guided Review: each gets an explanation, then practice. About 15 minutes. */
const GUIDED_SKILLS = 3

/**
 * Starts a study session.
 *   Quick Check: 4 to 6 questions on the skills asked for (a material's, or a recommended step's), filled with the
 *   course's other skills that need attention. It shows what the student can do on their own.
 *   Guided Review: up to 3 skills, each with an explanation from the material first and then practice. Everything
 *   after an explanation is practice, so it never confirms a skill on its own.
 * The questions are written now and stored with their keys apart; the browser only ever gets the questions.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const body = await req.json()
    const clock = clientClock(body)
    const courseId = await assertOwnCourse(db, user.id, body.courseId)
    const learning = await loadLearning(db, { courseId, ...clock })
    const guided = body.mode === 'guided_review'

    let focus: number[] = []
    if (body.materialId) focus = materialInfos(learning).find((m) => m.id === Number(body.materialId))?.skillIds ?? []
    else if (Array.isArray(body.skillIds))
      focus = body.skillIds.map(Number).filter((id: number) => learning.states.has(id))
    focus = [...new Set(focus)]

    const state = (s: SkillRow) => learning.states.get(s.id)!
    const others = learning.active
      .filter((s) => !focus.includes(s.id) && state(s).state !== 'confirmed')
      .sort((a, b) => URGENCY[state(a).state] - URGENCY[state(b).state])
    let chosen = focus.length
      ? [...focus.map((id) => learning.skills.get(id)!), ...others.slice(0, Math.max(0, MIN_QUESTIONS - focus.length))]
      : others
    if (guided) chosen = chosen.slice(0, GUIDED_SKILLS)
    if (!chosen.length) throw new HttpError(409, 'This course has no ideas to practice yet. Add material first.')
    const plan = planQuestions(
      chosen.map((s) => ({ facets: s.facets, state: state(s) })),
      guided ? { max: GUIDED_SKILLS } : undefined,
    )
    const skillIds = [...new Set(plan.map((p) => p.skillId))]

    const mode = guided ? 'guided_review' : 'quick_check'
    const id = await startSession(user.id, courseId, mode, skillIds, POLICY_VERSION)
    try {
      const rows = skillIds.map((sid) => learning.skills.get(sid)!)
      const contexts = await skillContexts(db, rows, learning.sources)
      const materialIds = new Set(
        learning.sources.filter((s) => skillIds.includes(s.skill_id)).map((s) => s.material_id),
      )
      const graded = learning.materials.some((m) => materialIds.has(m.id) && m.policy === 'graded')
      const [written, explanations] = await Promise.all([
        writeQuestions({ plan, skills: contexts, graded, userId: user.id, studySessionId: id }),
        guided
          ? writeGuidedExplanations({
              skills: skillIds.map((sid) => contexts.get(sid)!),
              userId: user.id,
              studySessionId: id,
            })
          : Promise.resolve([]),
      ])
      const questions = plan
        .map((slot, i) => (written[i] ? toItem(`q${i + 1}`, slot, written[i]) : null))
        .filter((q): q is NewItem => q !== null)
      if (questions.length < Math.min(3, plan.length))
        throw new HttpError(502, 'Lyceo couldn’t write good questions this time. Try again.')
      let items: NewItem[] = questions
      if (guided) {
        // Each skill's explanation goes right before its first question; second questions come at the end.
        items = []
        const later: NewItem[] = []
        for (const q of questions) {
          if (items.some((i) => i.skillId === q.skillId)) {
            later.push(q)
            continue
          }
          const e = explanations.find((x) => x.skillId === q.skillId)
          if (e?.explanation.trim())
            items.push({
              id: `e-${q.id}`,
              type: 'explanation',
              skillId: q.skillId,
              difficulty: q.difficulty,
              facet: q.facet,
              prompt: e.explanation.trim().slice(0, 3000),
              sources: citation(contexts.get(q.skillId)!.excerpts, e.page, e.quote),
            })
          items.push(q)
        }
        items.push(...later)
      }
      await addItems(user.id, id, items)
    } catch (err) {
      await finishSession(user.id, id, 'stopped', null).catch(() => {})
      throw err
    }
    return NextResponse.json({ sessionId: id })
  } catch (err) {
    return errorResponse(err, 'Could not start the Quick Check. Try again.')
  }
}
