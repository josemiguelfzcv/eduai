import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../../../lib/server/auth'
import { requireLearningLoop } from '../../../../lib/server/learning-data'
import { touchSession } from '../../../../lib/server/records'
import { sessionId } from '../../../../lib/server/sessions'

type Context = { params: Promise<{ id: string }> }

/** Records the active time the browser measured (it pauses when the tab is hidden or the student is idle). */
export async function POST(req: NextRequest, context: Context) {
  try {
    const { user } = await requireUser(req)
    requireLearningLoop(user)
    const id = sessionId((await context.params).id)
    const body = await req.json()
    const seconds = Number(body.activeSeconds)
    if (Number.isFinite(seconds) && seconds > 0) await touchSession(user.id, id, Math.min(seconds, 86_400))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, 'Could not save the time.')
  }
}
