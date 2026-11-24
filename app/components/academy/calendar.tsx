'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clockTime,
  planTimes,
  zonedInstant,
  type Busy,
  type CalendarStatus,
  type PlanStep,
  type StudySession,
} from '../../lib/calendar'
import { deleteJSON, getJSON, postJSON } from '../../lib/supabase'

// Google Calendar in the Study Plan: whether it's connected, when the student is busy, and the two things Lyceo
// writes to its own calendar (deadlines, and today's study sessions when the student asks). Nothing here shows where
// the server isn't set up for it (status.configured is false), so production looks as it did.

export type CalendarNotice = { tone: 'good' | 'bad'; text: string }

const RESULTS: Record<string, CalendarNotice> = {
  connected: { tone: 'good', text: 'Google Calendar is connected.' },
  denied: {
    tone: 'bad',
    text: 'Google Calendar wasn’t connected: Lyceo didn’t get permission. Connect again and allow both options.',
  },
  retry: {
    tone: 'bad',
    text: 'That connection link expired or was opened in another browser. Connect again from here.',
  },
  error: { tone: 'bad', text: 'Google Calendar couldn’t be connected. Try again in a minute.' },
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

/** The connection, the student's busy times for the days asked about, and what can be done with them. */
export function useCalendar(days: { from: string; to: string } | null) {
  const [timeZone] = useState(browserZone)
  const [status, setStatus] = useState<CalendarStatus | null>(null)
  const [notice, setNotice] = useState<CalendarNotice | null>(null)
  const [working, setWorking] = useState<null | 'connect' | 'disconnect' | 'sync' | 'sessions'>(null)
  const [busy, setBusy] = useState<{ key: string; list: Busy[]; at: number } | null>(null)
  const [busyProblem, setBusyProblem] = useState<{ key: string; text: string } | null>(null)

  const loadStatus = useCallback(() => getJSON<CalendarStatus>('/api/calendar').then(setStatus), [])

  const syncDeadlines = useCallback(
    async (quiet = false) => {
      setWorking('sync')
      try {
        const result = await postJSON<{ written: number; removed: number; deadlines: number }>('/api/calendar/sync', {
          timeZone,
        })
        if (!quiet || result.deadlines) {
          const what =
            result.deadlines === 0
              ? 'You have no open deadlines to put on the Lyceo calendar.'
              : `Your ${result.deadlines === 1 ? 'open deadline is' : `${result.deadlines} open deadlines are`} on a new calendar called Lyceo.`
          setNotice({ tone: 'good', text: quiet ? `Google Calendar is connected. ${what}` : what })
        }
        await loadStatus()
      } catch (err) {
        setNotice({ tone: 'bad', text: message(err, 'Your deadlines couldn’t be put on Google Calendar.') })
        await loadStatus().catch(() => {})
      } finally {
        setWorking(null)
      }
    },
    [timeZone, loadStatus],
  )

  // The status, once; and the result of a connection that just came back from Google (?calendar=...).
  useEffect(() => {
    let gone = false
    loadStatus()
      .then(async () => {
        const url = new URL(window.location.href)
        const result = url.searchParams.get('calendar')
        if (!result || gone) return
        url.searchParams.delete('calendar')
        window.history.replaceState(window.history.state, '', url)
        setNotice(RESULTS[result] ?? RESULTS.error)
        if (result === 'connected') await syncDeadlines(true)
      })
      .catch(() => setStatus(null))
    return () => {
      gone = true
    }
  }, [loadStatus, syncDeadlines])

  const live = Boolean(status?.connected && !status.expired)
  const from = days ? zonedInstant(days.from, 0, timeZone).toISOString() : null
  const to = days ? zonedInstant(days.to, 0, timeZone).toISOString() : null
  const key = `${from}/${to}`
  useEffect(() => {
    if (!live || !status?.canSeeBusy || !from || !to) return
    let gone = false
    getJSON<{ busy: Busy[] }>(`/api/calendar/busy?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(
      (r) => !gone && setBusy({ key, list: r.busy, at: Date.now() }),
      (err) => {
        if (gone) return
        setBusyProblem({ key, text: message(err, 'Your calendar couldn’t be read.') })
        loadStatus().catch(() => {})
      },
    )
    return () => {
      gone = true
    }
  }, [live, status?.canSeeBusy, from, to, key, loadStatus])

  const connect = async () => {
    setWorking('connect')
    try {
      const { url } = await postJSON<{ url: string }>('/api/calendar/connect', {})
      window.location.assign(url)
    } catch (err) {
      setNotice({ tone: 'bad', text: message(err, 'Google Calendar couldn’t be connected.') })
      setWorking(null)
    }
  }

  const disconnect = async () => {
    setWorking('disconnect')
    try {
      await deleteJSON('/api/calendar')
      setNotice({
        tone: 'good',
        text: 'Google Calendar is disconnected. The Lyceo calendar stays in your Google account; delete it there if you like.',
      })
      setBusy(null)
      await loadStatus()
    } catch (err) {
      setNotice({ tone: 'bad', text: message(err, 'Google Calendar couldn’t be disconnected.') })
    } finally {
      setWorking(null)
    }
  }

  const addSessions = async (day: string, sessions: StudySession[]) => {
    setWorking('sessions')
    try {
      const { written } = await postJSON<{ written: number }>('/api/calendar/sessions', {
        day,
        timeZone,
        sessions: sessions.map((s) => ({
          start: s.start,
          end: s.end,
          steps: s.steps.map((t) => ({ title: t.title, course: t.course, start: t.start, end: t.end })),
        })),
      })
      setNotice({
        tone: 'good',
        text: `${written} study ${written === 1 ? 'session is' : 'sessions are'} on the Lyceo calendar in Google Calendar.`,
      })
      return true
    } catch (err) {
      setNotice({ tone: 'bad', text: message(err, 'Your study sessions couldn’t be added.') })
      await loadStatus().catch(() => {})
      return false
    } finally {
      setWorking(null)
    }
  }

  return {
    timeZone,
    status,
    live,
    busy: busy?.key === key ? busy.list : null,
    busyAt: busy?.key === key ? busy.at : null,
    busyProblem: busyProblem?.key === key ? busyProblem.text : null,
    notice,
    dismiss: () => setNotice(null),
    working,
    connect,
    disconnect,
    syncDeadlines: () => syncDeadlines(false),
    addSessions,
  }
}

export type CalendarState = ReturnType<typeof useCalendar>

/** Today's steps placed in free time, once the day's busy times are known. */
export function usePlacedSteps(calendar: CalendarState, today: string, steps: PlanStep[]) {
  const { busy, busyAt, timeZone, status } = calendar
  return useMemo(() => {
    if (!busy || busyAt === null || !status?.canSeeBusy) return null
    return planTimes({ day: today, timeZone, now: new Date(busyAt), busy, steps })
  }, [busy, busyAt, timeZone, status?.canSeeBusy, today, steps])
}

/** A day's busy times, clipped to the day and merged, as short labels. */
export function busyOnDay(busy: Busy[] | null, day: string, next: string, timeZone: string) {
  if (!busy) return []
  const start = zonedInstant(day, 0, timeZone).getTime()
  const end = zonedInstant(next, 0, timeZone).getTime()
  const spans = busy
    .map((b) => [Math.max(Date.parse(b.start), start), Math.min(Date.parse(b.end), end)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  return merged.map(([s, e]) => ({
    key: `${s}`,
    start: s,
    label: s === start && e === end ? 'All day' : timeRange(s, e, timeZone),
  }))
}

/** "9–10:30 AM", "11:30 AM–1 PM": the hour alone when it's on the hour, the period once when both share it. */
export function timeRange(start: number, end: number, timeZone: string) {
  const [a, b] = [start, end].map((t) => clockTime(new Date(t).toISOString(), timeZone).replace(':00', ''))
  const period = (x: string) => x.slice(-2)
  return period(a) === period(b) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`
}

/** The calendar control in the week's header: connect, or what's connected and what can be done. */
export function CalendarControl({ calendar }: { calendar: CalendarState }) {
  const { status, working } = calendar
  const [confirming, setConfirming] = useState(false)
  if (!status?.configured) return null
  const pill =
    'inline-flex items-center gap-2 rounded-[10px] border border-ivory/35 px-3 py-[5px] text-[0.88rem] text-ivory hover:bg-ivory/[0.12] disabled:opacity-60'
  if (!status.connected || status.expired) {
    return (
      <button type="button" className={pill} onClick={calendar.connect} disabled={working === 'connect'}>
        {working === 'connect'
          ? 'Opening Google'
          : status.expired
            ? 'Reconnect Google Calendar'
            : 'Connect Google Calendar'}
      </button>
    )
  }
  return (
    <details className="relative" onToggle={(e) => !e.currentTarget.open && setConfirming(false)}>
      <summary className={`${pill} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <span aria-hidden="true" className="size-2 rounded-full bg-[#9fd49a]" />
        Google Calendar
      </summary>
      <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[19rem] rounded-[12px] border border-[#e6dccb] bg-[#fdf8f0] p-4 text-[0.9rem] text-[#33342f] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.45)]">
        <p className="m-0 font-medium text-[#1d1c19]">Connected{status.email ? ` as ${status.email}` : ''}</p>
        <p className="m-0 mt-1 leading-snug text-[#4b4a43]">
          {status.canSeeBusy
            ? 'Lyceo sees when you’re busy, not what your events are.'
            : 'Lyceo can’t see when you’re busy.'}{' '}
          {status.canWrite
            ? 'Your open deadlines are on a calendar called Lyceo.'
            : 'It can’t add events: connect again and allow it.'}
        </p>
        {status.canWrite && (
          <button
            type="button"
            className="mt-3 block text-[#1f4a2c] underline underline-offset-4 disabled:opacity-60"
            onClick={calendar.syncDeadlines}
            disabled={working === 'sync'}
          >
            {working === 'sync' ? 'Updating your deadlines' : 'Update deadlines now'}
          </button>
        )}
        {confirming ? (
          <p className="m-0 mt-3">
            Disconnect? Lyceo stops seeing your calendar; the Lyceo calendar stays in Google.{' '}
            <button
              type="button"
              className="font-medium text-terracotta underline underline-offset-4 disabled:opacity-60"
              onClick={calendar.disconnect}
              disabled={working === 'disconnect'}
            >
              {working === 'disconnect' ? 'Disconnecting' : 'Disconnect'}
            </button>{' '}
            <button type="button" className="underline underline-offset-4" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </p>
        ) : (
          <button
            type="button"
            className="mt-2 block text-terracotta underline underline-offset-4"
            onClick={() => setConfirming(true)}
          >
            Disconnect
          </button>
        )}
      </div>
    </details>
  )
}

/** What just happened with Google Calendar, above the page's content. */
export function CalendarBanner({ calendar }: { calendar: CalendarState }) {
  const { notice } = calendar
  if (!notice) return null
  return (
    <div
      role={notice.tone === 'bad' ? 'alert' : 'status'}
      className={`flex items-start gap-4 rounded-[14px] border px-5 py-3 text-[0.95rem] ${notice.tone === 'good' ? 'border-[#cfe0c8] bg-[#eef5ea] text-[#1f4a2c]' : 'border-terracotta/30 bg-[#fbeee6] text-[#7a3518]'}`}
    >
      <p className="m-0 flex-1">{notice.text}</p>
      <button type="button" className="shrink-0 underline underline-offset-4" onClick={calendar.dismiss}>
        Dismiss
      </button>
    </div>
  )
}
