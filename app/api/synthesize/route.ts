import { NextRequest, NextResponse } from 'next/server'
import type { Lesson } from '../../lib/lesson'
import { errorResponse, HttpError, requireUser } from '../../lib/server/auth'
import { writeLesson } from '../../lib/server/ai'
import { getOwnCourse } from '../../lib/server/courses'
import { loadLearner, personalizationFor } from '../../lib/server/learner'

/** Writes a lesson from extracted material, tailored to the student's learner model. */
export async function POST(req: NextRequest) {
  let courseId: number | null = null
  let db: Awaited<ReturnType<typeof requireUser>>['db'] | null = null
  try {
    const auth = await requireUser(req)
    db = auth.db
    const { courseId: id, text } = await req.json()
    if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'There is no material to teach from.')

    const course = await getOwnCourse(db, auth.user.id, id)
    courseId = course.id

    const learner = await loadLearner(db, auth.user.id)
    const personalization = personalizationFor(learner)
    const draft = await writeLesson({ courseTitle: course.title, material: text, student: personalization })
    const lesson: Lesson = { ...draft, meta: { version: 2, kind: 'lesson', personalization } }

    const { error } = await db.from('courses').update({ script: lesson, status: 'ready' }).eq('id', courseId)
    if (error) throw error

    return NextResponse.json({ courseId, lesson })
  } catch (err) {
    if (db && courseId !== null) await db.from('courses').update({ status: 'failed' }).eq('id', courseId)
    return errorResponse(err, 'Theo could not write this lesson. Try again in a minute.')
  }
}
