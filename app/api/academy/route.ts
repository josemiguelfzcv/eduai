import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../lib/server/auth'
import { buildSnapshot, loadAcademyData, todayFrom } from '../../lib/server/academy'
import { learningLoopEnabled, loadLearning } from '../../lib/server/learning-data'
import { validTimeZone } from '../../lib/mastery'

/** My Academy: today's plan, upcoming deadlines, courses and progress, from the student's real data. */
export async function GET(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const today = todayFrom(req)
    const tz = validTimeZone(new URL(req.url).searchParams.get('tz'))
    const [data, learning] = await Promise.all([
      loadAcademyData(db, user.id),
      learningLoopEnabled(user) ? loadLearning(db, { tz, today }) : null,
    ])
    return NextResponse.json(buildSnapshot(data, today, learning ? { learning, now: new Date() } : undefined))
  } catch (err) {
    return errorResponse(err, 'Could not load My Academy.')
  }
}
