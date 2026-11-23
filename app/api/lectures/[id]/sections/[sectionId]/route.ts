import { NextRequest } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../../lib/server/auth'
import { requireLearningLoop } from '../../../../../lib/server/learning-data'
import { writeSection, lectureId } from '../../../../../lib/server/lessons'
import { clientClock } from '../../../../../lib/server/sessions'

export const maxDuration = 300

type Context = { params: Promise<{ id: string; sectionId: string }> }

/**
 * One section of the lesson. Written already: JSON {content}. Not yet: its text streams as it's written (plain
 * text), and is kept when it's done.
 */
export async function POST(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const params = await context.params
    const id = lectureId(params.id)
    if (!/^[a-z0-9-]{1,40}$/.test(params.sectionId)) throw new HttpError(404, 'That section is not in this lesson.')
    const body = await req.json().catch(() => ({}))
    return await writeSection(db, user.id, id, params.sectionId, clientClock(body))
  } catch (err) {
    return errorResponse(err, 'Could not write this section. Try again.')
  }
}
