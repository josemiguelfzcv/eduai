import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../lib/server/auth'
import { buildSnapshot, loadAcademyData, todayFrom } from '../../lib/server/academy'

/** My Academy: today's plan, upcoming deadlines, courses and progress, from the student's real data. */
export async function GET(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    return NextResponse.json(buildSnapshot(await loadAcademyData(db, user.id), todayFrom(req)))
  } catch (err) {
    return errorResponse(err, 'Could not load My Academy.')
  }
}
