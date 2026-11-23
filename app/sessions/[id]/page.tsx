'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell, LoadingNote, useRequiredUser } from '../../components/AppShell'
import { QuickCheckView, type Busy, type Result } from '../../components/study/QuickCheckView'
import { clockBody, clockQuery } from '../../lib/clock'
import type { SessionView } from '../../lib/views'
import type { SessionSummary } from '../../lib/study'
import { getJSON, postJSON, supabase } from '../../lib/supabase'

/** Saves the active time; with keepalive it still goes out while the tab is closing. */
async function touch(sessionId: number, activeSeconds: number) {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  await fetch(`/api/sessions/${sessionId}/touch`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ activeSeconds }),
  }).catch(() => {})
}

/**
 * Seconds of real study: the clock runs while the tab is visible and the student did something in the last 90
 * seconds. It starts from what the session already has, so a resumed session keeps counting.
 */
function useActiveTime(sessionId: number, initial: number, running: boolean) {
  const base = useRef(initial)
  const counted = useRef(0)
  const lastInput = useRef(0)
  const sent = useRef(0)
  useEffect(() => {
    base.current = Math.max(base.current, initial)
  }, [initial])
  useEffect(() => {
    if (!running) return
    lastInput.current = Date.now()
    const bump = () => (lastInput.current = Date.now())
    const kinds = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    kinds.forEach((k) => window.addEventListener(k, bump, { passive: true }))
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInput.current < 90_000) counted.current += 1
    }, 1000)
    const flush = () => {
      const total = base.current + counted.current
      if (total - sent.current < 10) return
      sent.current = total
      touch(sessionId, total)
    }
    const every = window.setInterval(flush, 60_000)
    const hidden = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', hidden)
    return () => {
      flush()
      window.clearInterval(tick)
      window.clearInterval(every)
      document.removeEventListener('visibilitychange', hidden)
      kinds.forEach((k) => window.removeEventListener(k, bump))
    }
  }, [sessionId, running])
  return useCallback(() => base.current + counted.current, [])
}

/** A Quick Check: one question at a time, an explanation and a new problem after a miss, and a closure. */
export default function QuickCheck() {
  const user = useRequiredUser()
  const id = Number(useParams<{ id: string }>().id)
  const [view, setView] = useState<SessionView | null>(null)
  const [error, setError] = useState<string | null>(null)
  // What the student typed, per question, so moving on never carries an answer over.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [clarify, setClarify] = useState<{ itemId: string; message: string } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [teachError, setTeachError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [closure, setClosure] = useState<{ summary: SessionSummary; paused: boolean } | null>(null)
  const shownAt = useRef<Record<string, number>>({})
  const teachingRef = useRef<string | null>(null)
  const skippedRef = useRef<string[]>([])
  const running = !!view && view.session.status === 'active' && !closure
  const activeSeconds = useActiveTime(id, view?.session.activeSeconds ?? 0, running)
  const currentId = view?.current ?? null
  const answer = currentId ? (drafts[currentId] ?? '') : ''
  const setAnswer = (text: string) => currentId && setDrafts((d) => ({ ...d, [currentId]: text }))

  useEffect(() => {
    if (currentId && !shownAt.current[currentId]) shownAt.current[currentId] = Date.now()
  }, [currentId])

  // Writes the explanation and new problem for a missed question. Started as soon as the miss is recorded (or found
  // on opening the session), so it's usually ready by the time the student has read the result.
  const teach = useCallback(
    async (itemId: string) => {
      if (teachingRef.current) return
      teachingRef.current = itemId
      setTeachError(null)
      try {
        const res = await postJSON<{ view: SessionView }>(`/api/sessions/${id}/teach`, { itemId, ...clockBody() })
        setView(res.view)
      } catch (e) {
        setTeachError(e instanceof Error ? e.message : 'Could not write the explanation.')
      } finally {
        teachingRef.current = null
      }
    },
    [id],
  )
  const show = useCallback(
    (next: SessionView) => {
      setView(next)
      const due = next.session.status === 'active' ? next.pendingTeach : null
      if (due && !skippedRef.current.includes(due)) teach(due)
    },
    [teach],
  )

  const load = useCallback(
    () => getJSON<SessionView>(`/api/sessions/${id}?${clockQuery()}`).then(show, (e) => setError(e.message)),
    [id, show],
  )
  useEffect(() => {
    if (user) load()
  }, [user, load])

  const pending = view?.pendingTeach && !skipped.includes(view.pendingTeach) ? view.pendingTeach : null

  const submit = async (dontKnow = false) => {
    if (!view?.current || busy) return
    const itemId = view.current
    if (!dontKnow && !answer.trim()) return
    setBusy('answer')
    setError(null)
    try {
      const res = await postJSON<{
        verdict: string
        feedback: string | null
        uncertain: boolean
        clarify: string | null
        view: SessionView
      }>(`/api/sessions/${id}/answer`, {
        itemId,
        answer: dontKnow ? '' : answer,
        dontKnow,
        activeSeconds: activeSeconds(),
        secondsOnQuestion: Math.round((Date.now() - (shownAt.current[itemId] ?? Date.now())) / 1000),
        ...clockBody(),
      })
      if (res.clarify) {
        setClarify({ itemId, message: res.clarify })
        setView(res.view)
      } else {
        setClarify(null)
        setResult({ itemId, verdict: res.verdict, feedback: res.feedback, uncertain: res.uncertain, dontKnow })
        show(res.view)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check that answer.')
      if (e instanceof Error && /already answered/.test(e.message)) load()
    } finally {
      setBusy(null)
    }
  }

  const hint = async () => {
    if (!view?.current || busy) return
    setBusy('hint')
    try {
      await postJSON(`/api/sessions/${id}/hint`, { itemId: view.current })
      setView(await getJSON<SessionView>(`/api/sessions/${id}?${clockQuery()}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not show a hint.')
    } finally {
      setBusy(null)
    }
  }

  const finish = async (pause: boolean) => {
    setBusy('finish')
    try {
      const res = await postJSON<{ summary: SessionSummary }>(`/api/sessions/${id}/finish`, {
        pause,
        activeSeconds: activeSeconds(),
        ...clockBody(),
      })
      setClosure({ summary: res.summary, paused: pause })
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not close the session.')
    } finally {
      setBusy(null)
    }
  }

  if (!view) {
    return (
      <AppShell>
        {error ? (
          <div role="alert" className="panel p-6">
            <p>{error}</p>
            <Link href="/dashboard" className="btn btn-quiet mt-4 no-underline">
              Back to My Academy
            </Link>
          </div>
        ) : (
          <LoadingNote>Opening your session</LoadingNote>
        )}
      </AppShell>
    )
  }

  return (
    <AppShell>
      <QuickCheckView
        view={view}
        answer={answer}
        setAnswer={setAnswer}
        clarify={clarify?.itemId === view.current ? clarify.message : null}
        result={result}
        pending={pending}
        teachError={teachError}
        busy={busy}
        closure={closure}
        error={error}
        onSubmit={submit}
        onHint={hint}
        onContinue={() => {
          const done = result && !view.current && view.pendingTeach !== result.itemId
          setResult(null)
          if (done) finish(false)
          window.scrollTo({ top: 0 })
        }}
        onRetryTeach={() => pending && teach(pending)}
        onSkipTeach={() => {
          if (!pending) return
          skippedRef.current = [...skippedRef.current, pending]
          setSkipped(skippedRef.current)
          setTeachError(null)
        }}
        onFinish={finish}
        onResume={() => setClosure(null)}
      />
    </AppShell>
  )
}
