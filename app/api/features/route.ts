import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../lib/server/auth'
import { learningLoopEnabled } from '../../lib/server/learning-data'

/** Which parts of Lyceo this deployment runs, for a signed-in student's navigation. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req)
    return NextResponse.json({ learningLoop: learningLoopEnabled() })
  } catch (err) {
    return errorResponse(err, 'Could not load the app settings.')
  }
}
