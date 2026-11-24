import { NextRequest, NextResponse } from 'next/server'
import { validTimeZone } from '../../../lib/calendar'
import { errorResponse, requireUser } from '../../../lib/server/auth'
import { syncDeadlines } from '../../../lib/server/calendar'
import { googleFailure, openDeadlines } from '../../../lib/server/calendar-sync'

/** Puts the student's open deadlines on the Lyceo calendar (and takes off the finished and deleted ones). */
export async function POST(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const deadlines = await openDeadlines(db, user.id)
    const result = await syncDeadlines(user.id, deadlines, validTimeZone(body.timeZone)).catch(googleFailure)
    return NextResponse.json({ ...result, deadlines: deadlines.length })
  } catch (err) {
    return errorResponse(err, 'Could not put your deadlines on Google Calendar.')
  }
}
