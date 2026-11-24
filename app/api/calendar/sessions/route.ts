import { NextRequest, NextResponse } from 'next/server'
import { clockTime, validTimeZone } from '../../../lib/calendar'
import { errorResponse, HttpError, requireUser } from '../../../lib/server/auth'
import { writeSessions } from '../../../lib/server/calendar'
import { googleFailure, requestOrigin } from '../../../lib/server/calendar-sync'

type Step = { title: string; course: string | null; start: string; end: string }
type Session = { start: string; end: string; steps: Step[] }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const HOUR = 3600_000

function short(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function instant(value: unknown) {
  const t = typeof value === 'string' ? Date.parse(value) : NaN
  if (!Number.isFinite(t)) throw new HttpError(400, 'A session has a time Lyceo can’t read.')
  return t
}

/** Reads and checks the sessions the Study Plan placed: at most twelve, each within a day of `day`, none too long. */
function readSessions(body: unknown, day: string): Session[] {
  const list = (body as { sessions?: unknown })?.sessions
  if (!Array.isArray(list) || list.length > 12) throw new HttpError(400, 'Send between 0 and 12 sessions.')
  const dayStart = Date.parse(`${day}T00:00:00Z`)
  return list.map((raw) => {
    const s = raw as Record<string, unknown>
    const start = instant(s.start)
    const end = instant(s.end)
    if (end <= start || end - start > 3 * HOUR || start < dayStart - 14 * HOUR || end > dayStart + 38 * HOUR) {
      throw new HttpError(400, 'A session is outside the day or too long.')
    }
    const steps = Array.isArray(s.steps) ? s.steps.slice(0, 8) : []
    if (!steps.length) throw new HttpError(400, 'A session has no steps.')
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      steps: steps.map((raw) => {
        const step = raw as Record<string, unknown>
        return {
          title: short(step.title, 160) || 'Study',
          course: short(step.course, 80) || null,
          start: new Date(instant(step.start)).toISOString(),
          end: new Date(instant(step.end)).toISOString(),
        }
      }),
    }
  })
}

/** Puts today's study sessions on the student's Lyceo calendar, replacing what Lyceo put there for that day. */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const day = typeof body.day === 'string' && DAY.test(body.day) ? body.day : null
    if (!day) throw new HttpError(400, 'Which day?')
    const timeZone = validTimeZone(body.timeZone)
    const sessions = readSessions(body, day)
    const link = `${requestOrigin(req)}/study-plan`
    const result = await writeSessions(
      user.id,
      day,
      sessions.map((s) => {
        const courses = [...new Set(s.steps.map((t) => t.course).filter(Boolean))]
        return {
          start: s.start,
          end: s.end,
          summary:
            s.steps.length === 1
              ? `Study: ${s.steps[0].title}`
              : `Study: ${s.steps.length} steps${courses.length ? ` (${courses.join(', ')})` : ''}`,
          description: [
            ...s.steps.map((t) => `${clockTime(t.start, timeZone)}  ${t.title}${t.course ? ` (${t.course})` : ''}`),
            '',
            `Your plan in Lyceo: ${link}`,
          ].join('\n'),
        }
      }),
      timeZone,
    ).catch(googleFailure)
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err, 'Could not add your study sessions to Google Calendar.')
  }
}
