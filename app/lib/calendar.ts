// Google Calendar, the parts the browser and the server share: what the connection's status says, and how today's
// steps are placed in the student's free time. Times are instants (ISO strings); a day and a time zone say which
// local day is meant, so the arithmetic never depends on the machine's own zone.

export type CalendarStatus = {
  /** The server has what it needs (Google client, key, database). False on production today. */
  configured: boolean
  connected: boolean
  /** Google stopped accepting the connection (it lasts seven days while the app is in testing); connect again. */
  expired: boolean
  /** The Google account connected, which can differ from the one used to sign in. */
  email: string | null
  /** Permission to see when the student is busy. */
  canSeeBusy: boolean
  /** Permission to keep Lyceo's own calendar. */
  canWrite: boolean
  lastSyncedAt: string | null
}

export type Busy = { start: string; end: string }

/** One step of today's plan, as the planner sees it. */
export type PlanStep = { key: string; title: string; minutes: number; course: string | null }

/** Steps placed one after another in a stretch of free time. */
export type StudySession = { start: string; end: string; steps: (PlanStep & { start: string; end: string })[] }

export type StudyWindow = { from: number; to: number }

/** Unless the student says otherwise: study between 8 am and 10 pm. */
export const DEFAULT_WINDOW: StudyWindow = { from: 8 * 60, to: 22 * 60 }
/** Kept clear before and after anything on the student's calendar. */
const BUFFER = 10
/** A break between sessions, and the longest stretch without one. */
const BREAK = 10
const LONGEST = 50
const STEP = 5 * 60_000

/** How far a time zone is ahead of UTC at an instant, in minutes. */
export function zoneOffset(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

/** The instant a local day reaches a time (minutes after midnight) in a time zone. */
export function zonedInstant(day: string, minutes: number, timeZone: string) {
  const [y, m, d] = day.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d, 0, minutes)
  let t = wall - zoneOffset(new Date(wall), timeZone) * 60_000
  // Once more, in case a daylight-saving change falls between the guess and the answer.
  t = wall - zoneOffset(new Date(t), timeZone) * 60_000
  return new Date(t)
}

/** The local day (YYYY-MM-DD) of an instant in a time zone. */
export function zonedDay(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  )
}

/** A time zone the browser and Google both understand, or UTC. */
export function validTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return value
  } catch {
    return 'UTC'
  }
}

const ceilToStep = (t: number) => Math.ceil(t / STEP) * STEP

/**
 * Places today's steps, in their order, in the free time of one day: inside the study window, clear of what is on
 * the calendar (with a margin either side), never in the past. Steps follow one another in sessions of up to 50
 * minutes with a 10-minute break between sessions. A step that doesn't fit anywhere left in the day is returned in
 * `unplaced`, and so is every step after it, so the order stays the plan's.
 */
export function planTimes(options: {
  day: string
  timeZone: string
  now: Date
  busy: Busy[]
  steps: PlanStep[]
  window?: StudyWindow
}): { sessions: StudySession[]; unplaced: PlanStep[] } {
  const { day, timeZone, now, steps } = options
  const window = options.window ?? DEFAULT_WINDOW
  const open = Math.max(zonedInstant(day, window.from, timeZone).getTime(), ceilToStep(now.getTime() + 5 * 60_000))
  const close = zonedInstant(day, window.to, timeZone).getTime()

  // What is taken, widened by the margin and merged.
  const taken = options.busy
    .map((b) => [Date.parse(b.start) - BUFFER * 60_000, Date.parse(b.end) + BUFFER * 60_000] as const)
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > open && s < close)
    .sort((a, b) => a[0] - b[0])
  const free: [number, number][] = []
  let cursor = open
  for (const [s, e] of taken) {
    if (s > cursor) free.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (close > cursor) free.push([cursor, close])

  const sessions: StudySession[] = []
  let gap = 0
  let at = free.length ? free[0][0] : close
  let session: StudySession | null = null
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const length = Math.max(5, Math.ceil(step.minutes / 5) * 5) * 60_000
    for (;;) {
      if (gap >= free.length) return { sessions, unplaced: steps.slice(i) }
      const [, gapEnd] = free[gap]
      const runs = session ? Date.parse(session.end) - Date.parse(session.start) : 0
      // A new session starts after a break, unless it is the first thing in this stretch of free time.
      const continues = session !== null && Date.parse(session.end) === at && runs + length <= LONGEST * 60_000
      const start: number = session && !continues && Date.parse(session.end) === at ? at + BREAK * 60_000 : at
      if (start + length <= gapEnd) {
        const placed: PlanStep & { start: string; end: string } = {
          ...step,
          start: new Date(start).toISOString(),
          end: new Date(start + length).toISOString(),
        }
        if (continues && session) {
          session.steps.push(placed)
          session.end = placed.end
        } else {
          session = { start: placed.start, end: placed.end, steps: [placed] }
          sessions.push(session)
        }
        at = start + length
        break
      }
      gap++
      if (gap < free.length) at = free[gap][0]
      session = null
    }
  }
  return { sessions, unplaced: [] }
}

/** "2:10 PM" in a time zone. */
export function clockTime(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
}
