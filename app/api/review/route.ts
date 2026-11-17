import { NextRequest, NextResponse } from 'next/server'
import type { Lesson } from '../../lib/lesson'
import { errorResponse, HttpError, requireUser } from '../../lib/server/auth'
import { writeReview } from '../../lib/server/ai'
import { getOwnCourse } from '../../lib/server/courses'
import { loadLearner, personalizationFor } from '../../lib/server/learner'

type Attempt = { segment_index: number; correct: boolean; answer: string | null; created_at: string }

/** Builds a short review lesson from the parts of a lesson the student didn't get on the first try. */
export async function POST(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const { courseId } = await req.json()
    const course = await getOwnCourse(db, user.id, courseId)
    if (!course.lesson) throw new HttpError(400, 'This lesson is not ready yet.')

    const { data, error } = await db
      .from('session_events')
      .select('segment_index, correct, answer, created_at')
      .eq('user_id', user.id)
      .eq('course_id', course.id)
      .order('created_at', { ascending: true })
    if (error) throw error

    const bySegment = new Map<number, Attempt[]>()
    for (const e of (data ?? []) as Attempt[])
      bySegment.set(e.segment_index, [...(bySegment.get(e.segment_index) ?? []), e])

    const missed = [...bySegment.entries()]
      .filter(([, attempts]) => !attempts[0].correct)
      .map(([index, attempts]) => ({
        segment: course.lesson!.segments[index],
        wrongAnswers: attempts
          .filter((a) => !a.correct && a.answer)
          .map((a) => a.answer!.slice(0, 300))
          .slice(-3),
      }))
      .filter((m) => m.segment)
      .slice(0, 4)

    if (!missed.length) {
      throw new HttpError(400, 'You got every check-in right on the first try, so there is nothing to review here.')
    }

    const personalization = personalizationFor(await loadLearner(db, user.id))
    const draft = await writeReview({ courseTitle: course.lesson.title, missed, student: personalization })
    const lesson: Lesson = {
      ...draft,
      meta: { version: 2, kind: 'review', personalization, sourceCourseId: course.id },
    }

    const { data: created, error: insertError } = await db
      .from('courses')
      .insert({
        user_id: user.id,
        title: `Review: ${course.lesson.title}`,
        description: `Review of ${missed.map((m) => m.segment.concept).join(', ')}`,
        status: 'ready',
        script: lesson,
      })
      .select('id')
      .single()
    if (insertError) throw insertError

    // Keep the review in the same My Academy course as its lesson. Best effort: before the
    // My Academy migration the column doesn't exist, and the review simply has no course.
    const { data: source } = await db
      .from('courses')
      .select('academy_course_id')
      .eq('id', course.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (source?.academy_course_id) {
      await db.from('courses').update({ academy_course_id: source.academy_course_id }).eq('id', created.id)
    }

    return NextResponse.json({ courseId: created.id })
  } catch (err) {
    return errorResponse(err, 'Theo could not build the review lesson. Try again in a minute.')
  }
}
