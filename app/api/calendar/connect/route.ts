import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../lib/server/auth'
import { authUrl, calendarSettings, callbackUrl, makeState, STATE_COOKIE } from '../../../lib/server/calendar'
import { requestOrigin } from '../../../lib/server/calendar-sync'

/**
 * Starts connecting Google Calendar: returns Google's consent page for the browser to open, and sets a short-lived
 * cookie that the callback checks, so the connection can only be finished in the browser that started it.
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req)
    const setup = calendarSettings()
    if ('missing' in setup) {
      console.error(`Google Calendar is not set up: missing ${setup.missing.join(', ')}`)
      throw new HttpError(503, `Google Calendar isn’t set up on this server yet (missing ${setup.missing.join(', ')}).`)
    }
    const origin = requestOrigin(req)
    const redirectUri = callbackUrl(origin)
    const home = new URL(redirectUri).origin
    if (home !== origin) throw new HttpError(409, `Open Lyceo at ${home} to connect your calendar.`)
    const { state, nonce } = makeState(user.id)
    const res = NextResponse.json({ url: authUrl({ redirectUri, state, email: user.email }) })
    res.cookies.set(STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: origin.startsWith('https:'),
      sameSite: 'lax',
      path: '/api/calendar',
      maxAge: 10 * 60,
    })
    return res
  } catch (err) {
    return errorResponse(err, 'Could not start connecting your Google Calendar.')
  }
}
