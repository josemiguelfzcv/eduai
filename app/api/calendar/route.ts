import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../lib/server/auth'
import { calendarStatus, disconnect } from '../../lib/server/calendar'

/** Whether the student's Google Calendar is connected, and what Lyceo may do with it. */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req)
    return NextResponse.json(await calendarStatus(user.id))
  } catch (err) {
    return errorResponse(err, 'Could not check your Google Calendar connection.')
  }
}

/** Disconnects: revokes Lyceo's access at Google and forgets the token. The Lyceo calendar itself stays theirs. */
export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireUser(req)
    await disconnect(user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, 'Could not disconnect your Google Calendar.')
  }
}
