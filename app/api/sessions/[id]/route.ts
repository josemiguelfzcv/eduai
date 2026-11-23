import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../../lib/server/auth'
import { requireLearningLoop } from '../../../lib/server/learning-data'
import { clientClock, sessionId, sessionView } from '../../../lib/server/sessions'

type Context = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = sessionId((await context.params).id)
    return NextResponse.json(await sessionView(db, user.id, id, clientClock(new URL(req.url).searchParams)))
  } catch (err) {
    return errorResponse(err, 'Could not load the session.')
  }
}
