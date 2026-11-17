import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../lib/server/auth'
import { loadLearner, summarizeLearner } from '../../lib/server/learner'

/** What Lyceo has learned about how this student learns. */
export async function GET(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    return NextResponse.json(summarizeLearner(await loadLearner(db, user.id)))
  } catch (err) {
    return errorResponse(err, 'Could not load your learning profile.')
  }
}
