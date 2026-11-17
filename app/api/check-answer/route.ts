import { NextRequest, NextResponse } from 'next/server'
import { DEMO_LESSON } from '../../lib/demo-lesson'
import { errorResponse, HttpError, optionalUser } from '../../lib/server/auth'
import { gradeAnswer } from '../../lib/server/ai'
import { getOwnCourse } from '../../lib/server/courses'
import { speechUrl } from '../../lib/server/tts'

/** Grades a check-in answer, re-explains when it's wrong, and records the result in the learner model. */
export async function POST(req: NextRequest) {
  try {
    const { demo, courseId, segmentIndex, answer, timeToAnswer } = await req.json()
    if (typeof answer !== 'string' || !answer.trim()) throw new HttpError(400, 'Write an answer first.')
    const index = Number(segmentIndex)

    const auth = demo ? null : await optionalUser(req)
    if (!demo && !auth) throw new HttpError(401, 'Sign in to continue.')

    let segment = demo ? DEMO_LESSON.segments[index] : undefined
    let styleId: string | null = null
    let missedBefore = 0

    if (auth) {
      const course = await getOwnCourse(auth.db, auth.user.id, courseId)
      segment = course.lesson?.segments[index]

      const [{ data: profile }, { count }] = await Promise.all([
        auth.db.from('users').select('learning_style').eq('id', auth.user.id).maybeSingle(),
        auth.db
          .from('session_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', auth.user.id)
          .eq('course_id', course.id)
          .eq('segment_index', index)
          .eq('correct', false),
      ])
      styleId = profile?.learning_style ?? null
      missedBefore = count ?? 0
    }
    if (!segment) throw new HttpError(404, 'That part of the lesson does not exist.')

    const cleanAnswer = answer.trim().slice(0, demo ? 400 : 1500)
    const grade = await gradeAnswer({ segment, answer: cleanAnswer, styleId, missedBefore })

    if (auth) {
      const { error } = await auth.db.from('session_events').insert({
        user_id: auth.user.id,
        course_id: Number(courseId),
        segment_index: index,
        question: segment.check.question,
        answer: cleanAnswer,
        correct: grade.correct,
        time_to_answer_seconds: Number.isFinite(timeToAnswer) ? Math.round(timeToAnswer) : null,
      })
      if (error) console.error('Could not save check-in', error)
    }

    return NextResponse.json({
      ...grade,
      reexplanationAudio: grade.reexplanation ? speechUrl(grade.reexplanation) : null,
    })
  } catch (err) {
    return errorResponse(err, 'Could not check your answer. Try again.')
  }
}
