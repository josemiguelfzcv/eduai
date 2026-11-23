import { NextRequest, NextResponse } from 'next/server'
import { assertOwnCourse } from '../../../../../lib/server/academy'
import { errorResponse, HttpError, requireUser } from '../../../../../lib/server/auth'
import { requireLearningLoop } from '../../../../../lib/server/learning-data'
import { inCourseOrder } from '../../../../../lib/server/lessons'

type Context = { params: Promise<{ id: string }> }

/**
 * Puts a course's materials in the order the student gives (the order the lectures were taught): the listed ones
 * first, in that order, then any not listed (still uploading, say) in the order they had. Each gets its place
 * (1, 2, 3, ...) as its sequence.
 */
export async function PUT(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const courseId = await assertOwnCourse(db, user.id, (await context.params).id)
    const body = await req.json().catch(() => ({}))
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : []
    if (!ids.length || ids.length > 500 || !ids.every(Number.isSafeInteger) || new Set(ids).size !== ids.length)
      throw new HttpError(400, 'Send every material of the course once, in order.')

    const { data, error } = await db
      .from('materials')
      .select('id, sequence, lecture_date, created_at')
      .eq('user_id', user.id)
      .eq('academy_course_id', courseId)
    if (error) throw error
    const materials = inCourseOrder(data ?? [])
    const owned = new Set(materials.map((m) => m.id))
    if (!ids.every((id) => owned.has(id)))
      throw new HttpError(409, 'The course’s materials changed. Reload and try again.')
    const order = [...ids, ...materials.map((m) => m.id).filter((id) => !ids.includes(id))]

    // One update per material; a course has a few dozen at most.
    for (const [i, id] of order.entries()) {
      const { error: failed } = await db
        .from('materials')
        .update({ sequence: i + 1 })
        .eq('id', id)
        .eq('user_id', user.id)
      if (failed) throw failed
    }
    return NextResponse.json({ ordered: order.length })
  } catch (err) {
    return errorResponse(err, 'Could not change the order.')
  }
}
