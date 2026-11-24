import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../lib/server/auth'
import { busyBetween } from '../../../lib/server/calendar'
import { googleFailure } from '../../../lib/server/calendar-sync'

const LONGEST = 15 * 24 * 3600 * 1000

/** When the student is busy, from their Google Calendar (times only; Lyceo never sees what the events are). */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req)
    const from = new Date(req.nextUrl.searchParams.get('from') ?? '')
    const to = new Date(req.nextUrl.searchParams.get('to') ?? '')
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || +to - +from > LONGEST) {
      throw new HttpError(400, 'Ask for at most two weeks at a time.')
    }
    const busy = await busyBetween(user.id, from, to).catch(googleFailure)
    return NextResponse.json({ busy })
  } catch (err) {
    return errorResponse(err, 'Could not read your Google Calendar.')
  }
}
