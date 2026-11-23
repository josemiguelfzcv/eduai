import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../../../lib/server/auth'
import { requireLearningLoop } from '../../../../lib/server/learning-data'
import { revealHint } from '../../../../lib/server/records'
import { sessionId } from '../../../../lib/server/sessions'

type Context = { params: Promise<{ id: string }> }

/** Shows the next hint for a question. The database counts it, so the answer that follows is recorded as helped. */
export async function POST(req: NextRequest, context: Context) {
  try {
    const { user } = await requireUser(req)
    requireLearningLoop(user)
    const id = sessionId((await context.params).id)
    const body = await req.json()
    return NextResponse.json(await revealHint(user.id, id, String(body.itemId ?? '')))
  } catch (err) {
    return errorResponse(err, 'Could not show a hint.')
  }
}
