import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../../../lib/server/auth'
import {
  courseNamesOf,
  loadLearning,
  loadSession,
  requireLearningLoop,
  summaryOf,
} from '../../../../lib/server/learning-data'
import { finishSession, touchSession } from '../../../../lib/server/records'
import { clientClock, sessionId } from '../../../../lib/server/sessions'

type Context = { params: Promise<{ id: string }> }

/**
 * The closure. `pause: true` (Stop for now) shows it and keeps the session open for 48 hours; otherwise the session
 * is completed and its summary saved for My Academy's "Since last time".
 */
export async function POST(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = sessionId((await context.params).id)
    const body = await req.json()
    const clock = clientClock(body)
    const pause = body.pause === true
    const seconds = Math.min(86_400, Math.max(0, Math.round(Number(body.activeSeconds) || 0)))

    let session = await loadSession(db, id)
    if (session.status === 'active' && seconds > 0) {
      await touchSession(user.id, id, seconds)
      session = await loadSession(db, id)
    }
    const learning = await loadLearning(db, { courseId: session.academy_course_id, ...clock })
    const names = await courseNamesOf(db)
    if (session.status !== 'active')
      return NextResponse.json({ summary: summaryOf(learning, session, names, true), status: session.status })

    const summary = summaryOf(learning, session, names, !pause)
    if (!pause) await finishSession(user.id, id, 'completed', summary, seconds || undefined)
    return NextResponse.json({ summary, status: pause ? 'active' : 'completed' })
  } catch (err) {
    return errorResponse(err, 'Could not close the session.')
  }
}
