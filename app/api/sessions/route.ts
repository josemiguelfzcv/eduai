import { NextRequest, NextResponse } from 'next/server'
import { assertOwnCourse } from '../../lib/server/academy'
import { errorResponse, HttpError, requireUser } from '../../lib/server/auth'
import { writeQuestions } from '../../lib/server/learning'
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
import { MIN_QUESTIONS, planQuestions } from '../../lib/study'

export const maxDuration = 120

/** Most urgent first; confirmed skills only come in when asked for. */
const URGENCY: Record<SkillStateName, number> = { needs_practice: 0, learning: 1, new: 2, review: 3, confirmed: 9 }

/**
 * Starts a Quick Check: 4 to 6 questions on the skills asked for (a material's, or a recommended step's), filled
 * with the course's other skills that need attention. The questions are written now and stored with their keys
 * apart; the browser only ever gets the questions.
 */
export async function POST(req: NextRequest) {
  try {
    requireLearningLoop()
    const { user, db } = await requireUser(req)
    const body = await req.json()
    const clock = clientClock(body)
    const courseId = await assertOwnCourse(db, user.id, body.courseId)
    const learning = await loadLearning(db, { courseId, ...clock })

    let focus: number[] = []
    if (body.materialId) focus = materialInfos(learning).find((m) => m.id === Number(body.materialId))?.skillIds ?? []
    else if (Array.isArray(body.skillIds))
      focus = body.skillIds.map(Number).filter((id: number) => learning.states.has(id))
    focus = [...new Set(focus)]

    const state = (s: SkillRow) => learning.states.get(s.id)!
    const others = learning.active
      .filter((s) => !focus.includes(s.id) && state(s).state !== 'confirmed')
      .sort((a, b) => URGENCY[state(a).state] - URGENCY[state(b).state])
    const chosen = focus.length
      ? [...focus.map((id) => learning.skills.get(id)!), ...others.slice(0, Math.max(0, MIN_QUESTIONS - focus.length))]
      : others
    if (!chosen.length) throw new HttpError(409, 'This course has no ideas to practice yet. Add material first.')
    const plan = planQuestions(chosen.map((s) => ({ facets: s.facets, state: state(s) })))
    const skillIds = [...new Set(plan.map((p) => p.skillId))]

    const id = await startSession(user.id, courseId, 'quick_check', skillIds, POLICY_VERSION)
    try {
      const rows = skillIds.map((sid) => learning.skills.get(sid)!)
      const contexts = await skillContexts(db, rows, learning.sources)
      const materialIds = new Set(
        learning.sources.filter((s) => skillIds.includes(s.skill_id)).map((s) => s.material_id),
      )
      const graded = learning.materials.some((m) => materialIds.has(m.id) && m.policy === 'graded')
      const written = await writeQuestions({ plan, skills: contexts, graded, userId: user.id, studySessionId: id })
      const items = plan
        .map((slot, i) => (written[i] ? toItem(`q${i + 1}`, slot, written[i]) : null))
        .filter((q): q is NewItem => q !== null)
      if (items.length < Math.min(3, plan.length))
        throw new HttpError(502, 'Lyceo couldn’t write good questions this time. Try again.')
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
