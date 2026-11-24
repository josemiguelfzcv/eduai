import 'server-only'
import { after, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { kindLabel } from '../../components/academy/format'
import type { DeadlineKind } from '../academy'
import { HttpError } from './auth'
import { calendarStatus, GoogleError, syncDeadlines, type DeadlineForCalendar } from './calendar'

// Keeping the Lyceo calendar in step with the student's deadlines. The deadlines are read as the student (row-level
// security applies), so this only ever sees their own.

export async function openDeadlines(db: SupabaseClient, userId: string): Promise<DeadlineForCalendar[]> {
  const [deadlines, courses] = await Promise.all([
    db
      .from('deadlines')
      .select('id, course_id, title, kind, due_on, topics')
      .eq('user_id', userId)
      .is('completed_at', null)
      .order('due_on'),
    db.from('academy_courses').select('id, name, code').eq('user_id', userId),
  ])
  if (deadlines.error) throw deadlines.error
  if (courses.error) throw courses.error
  const name = new Map(courses.data.map((c) => [Number(c.id), (c.code as string | null) || (c.name as string)]))
  return deadlines.data.map((d) => ({
    id: Number(d.id),
    title: String(d.title),
    kindLabel: kindLabel(d.kind as DeadlineKind),
    dueOn: String(d.due_on),
    topics: (d.topics as string | null) ?? null,
    course: name.get(Number(d.course_id)) ?? null,
  }))
}

/**
 * After a deadline or a course changes: if the student keeps their deadlines on Google Calendar, bring it up to date
 * once the response has gone out. Failures are logged, never shown; the next change or the Study Plan syncs again.
 */
export function syncSoon(db: SupabaseClient, userId: string) {
  after(async () => {
    try {
      const status = await calendarStatus(userId)
      if (!status.connected || status.expired || !status.canWrite) return
      await syncDeadlines(userId, await openDeadlines(db, userId), 'UTC')
    } catch (err) {
      console.error('Calendar sync after a change failed', err instanceof GoogleError ? err.message : err)
    }
  })
}

/** A Google failure as something the student can act on. */
export function googleFailure(err: unknown): never {
  if (err instanceof GoogleError) {
    console.error(err.message)
    if (err.status === 429 || err.reason === 'rateLimitExceeded' || err.reason === 'userRateLimitExceeded') {
      throw new HttpError(503, 'Google Calendar is busy. Try again in a minute.')
    }
    if (err.status === 401) throw new HttpError(409, 'Google didn’t accept the connection. Connect it again.')
    throw new HttpError(502, 'Google Calendar didn’t answer as expected. Try again.')
  }
  throw err
}

/** The public address the student is on (behind Vercel's proxy, the forwarded host). */
export function requestOrigin(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  return `${proto}://${host}`
}
