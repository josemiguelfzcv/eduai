import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../../lib/server/auth'
import { requireLearningLoop } from '../../../lib/server/learning-data'
import { lectureId, lectureView } from '../../../lib/server/lessons'
import { clientClock } from '../../../lib/server/sessions'

type Context = { params: Promise<{ id: string }> }

/** A lecture with its lesson, its place in the course and its Ask Lyceo conversation. */
export async function GET(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = lectureId((await context.params).id)
    return NextResponse.json(await lectureView(db, user.id, id, clientClock(new URL(req.url).searchParams)))
  } catch (err) {
    return errorResponse(err, 'Could not open this lecture.')
  }
}
