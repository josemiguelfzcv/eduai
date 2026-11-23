import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../lib/server/auth'
import { learningLoopEnabled } from '../../lib/server/learning-data'
import { serverRecordsEnabled } from '../../lib/server/records'

/** Which parts of Lyceo this deployment runs, for a signed-in student's navigation. */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req)
    // Account deletion needs the database function from migration 0004 and the server's cleanup of files.
    return NextResponse.json({ learningLoop: learningLoopEnabled(user), accountDeletion: serverRecordsEnabled() })
  } catch (err) {
    return errorResponse(err, 'Could not load the app settings.')
  }
}
