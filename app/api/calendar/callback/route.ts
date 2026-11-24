import { NextRequest, NextResponse } from 'next/server'
import {
  callbackUrl,
  exchangeCode,
  readState,
  revoke,
  saveConnection,
  STATE_COOKIE,
} from '../../../lib/server/calendar'
import { requestOrigin } from '../../../lib/server/calendar-sync'

/**
 * Where Google sends the student back. The state says who started (signed by the server) and must match the cookie
 * set when they did; then the code is exchanged for tokens and the refresh token is stored, encrypted. The student
 * lands on the Study Plan, which reads the result from ?calendar=.
 */
export async function GET(req: NextRequest) {
  const origin = requestOrigin(req)
  const back = (result: string) => {
    const res = NextResponse.redirect(`${origin}/study-plan?calendar=${result}`, 303)
    res.cookies.set(STATE_COOKIE, '', { path: '/api/calendar', maxAge: 0 })
    return res
  }
  const params = req.nextUrl.searchParams
  if (params.get('error')) return back('denied')
  try {
    const userId = readState(params.get('state'), req.cookies.get(STATE_COOKIE)?.value)
    const code = params.get('code')
    if (!userId || !code) return back('retry')
    const tokens = await exchangeCode(code, callbackUrl(origin))
    if (!tokens.refreshToken) return back('error')
    if (!tokens.scopes.length) {
      await revoke(tokens.refreshToken)
      return back('denied')
    }
    await saveConnection(userId, tokens.refreshToken, tokens.scopes, tokens.email)
    return back('connected')
  } catch (err) {
    console.error('Connecting Google Calendar failed', err instanceof Error ? err.message : err)
    return back('error')
  }
}
