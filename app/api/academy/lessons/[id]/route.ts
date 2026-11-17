import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import { assertOwnCourse, rows } from '../../../../lib/server/academy'

type Context = { params: Promise<{ id: string }> }

/** Moves a lesson into a course, or out of every course with { courseId: null }. */
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const { user, db } = await requireUser(req)
    const lessonId = Number((await params).id)
    if (!Number.isInteger(lessonId)) throw new HttpError(404, 'That lesson does not exist.')
    const body = await req.json()
    const courseId = body.courseId === null ? null : await assertOwnCourse(db, user.id, body.courseId)
    const updated = rows(
      await db
        .from('courses')
        .update({ academy_course_id: courseId })
        .eq('id', lessonId)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle(),
    )
    if (!updated) throw new HttpError(404, 'That lesson does not exist or is not yours.')
    return NextResponse.json({ ok: true, courseId })
  } catch (err) {
    return errorResponse(err, 'Could not move the lesson.')
  }
}
