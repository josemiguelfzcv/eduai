import { NextRequest } from 'next/server'
import { errorResponse, requireUser } from '../../../../lib/server/auth'
import { requireLearningLoop } from '../../../../lib/server/learning-data'
import { askLyceo, lectureId } from '../../../../lib/server/lessons'
import { clientClock } from '../../../../lib/server/sessions'

export const maxDuration = 120

type Context = { params: Promise<{ id: string }> }

/** Ask Lyceo: a question beside the lesson, answered as plain text streamed while it's written. */
export async function POST(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = lectureId((await context.params).id)
    const body = await req.json()
    const ctx = body.context && typeof body.context === 'object' ? body.context : null
    return await askLyceo(
      db,
      user.id,
      id,
      {
        message: String(body.message ?? ''),
        context: ctx
          ? {
              sectionId: typeof ctx.sectionId === 'string' ? ctx.sectionId : undefined,
              quote: typeof ctx.quote === 'string' ? ctx.quote : undefined,
            }
          : null,
      },
      clientClock(body),
    )
  } catch (err) {
    return errorResponse(err, 'Lyceo could not answer that. Try again.')
  }
}
