import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../../../lib/server/auth'
import { requireLearningLoop } from '../../../../lib/server/learning-data'
import { ensureLesson, lectureView, lectureId } from '../../../../lib/server/lessons'
import { clientClock } from '../../../../lib/server/sessions'

export const maxDuration = 120

type Context = { params: Promise<{ id: string }> }

/** Plans the lecture's written lesson (once) and returns the lecture with it. */
export async function POST(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = lectureId((await context.params).id)
    const body = await req.json().catch(() => ({}))
    await ensureLesson(db, user.id, id)
    return NextResponse.json(await lectureView(db, user.id, id, clientClock(body)))
  } catch (err) {
    return errorResponse(err, 'Could not plan this lesson. Try again.')
  }
}
