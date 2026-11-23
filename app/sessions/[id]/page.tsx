'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell, LoadingNote, useRequiredUser } from '../../components/AppShell'
import { MathInline, MathText } from '../../components/MathText'
import { Closure } from '../../components/study/Closure'
import { clockBody, clockQuery } from '../../lib/clock'
import type { SessionView } from '../../lib/views'
import type { SessionSummary } from '../../lib/study'
import { getJSON, postJSON, supabase } from '../../lib/supabase'

type Step = SessionView['steps'][number]
type Result = { itemId: string; verdict: string; feedback: string | null; uncertain: boolean; dontKnow: boolean }

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

const VERDICT: Record<string, { title: string; tone: string }> = {
  correct: { title: 'Right.', tone: 'text-moss' },
  partial: { title: 'Partly right.', tone: 'text-gold-deep' },
  incorrect: { title: 'Not quite.', tone: 'text-terracotta' },
  unclear: { title: 'That couldn’t be read as one answer, so it counts neither way.', tone: 'text-ink-soft' },
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
  const [busy, setBusy] = useState<'answer' | 'hint' | 'finish' | null>(null)
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
          <LoadingNote>Opening your Quick Check</LoadingNote>
        )}
      </AppShell>
    )
  }

  const summary = closure?.summary ?? view.summary
  const steps = view.steps
  const questions = steps.filter((s) => s.item.type === 'question')
  const current = steps.find((s) => s.item.id === view.current) ?? null
  const answered = result ? (steps.find((s) => s.item.id === result.itemId) ?? null) : null
  const head = (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[0.95rem] text-ink-soft">
          {view.session.courseId ? (
            <Link href={`/courses/${view.session.courseId}`} className="text-ink-soft underline underline-offset-4">
              {view.session.courseName}
            </Link>
          ) : (
            'Quick Check'
          )}
        </p>
        <h1 className="mt-1 text-[clamp(1.8rem,3.4vw,2.4rem)]">{summary ? 'How it went' : 'Quick Check'}</h1>
      </div>
      {!summary && view.session.status === 'active' && (
        <div className="flex items-center gap-4">
          <p className="text-[0.92rem] text-ink-soft" aria-live="polite">
            {view.answered} of {view.questions} answered
          </p>
          <button type="button" className="btn btn-quiet" onClick={() => finish(true)} disabled={busy !== null}>
            Stop for now
          </button>
        </div>
      )}
    </header>
  )

  if (summary) {
    return (
      <AppShell>
        {head}
        <div className="mt-8 max-w-2xl">
          <Closure summary={summary} />
          <div className="mt-10 flex flex-wrap gap-3">
            {closure?.paused && (
              <button type="button" className="btn btn-primary" onClick={() => setClosure(null)}>
                Keep going
              </button>
            )}
            <Link href="/dashboard" className={`btn ${closure?.paused ? 'btn-quiet' : 'btn-primary'} no-underline`}>
              Back to My Academy
            </Link>
          </div>
        </div>
      </AppShell>
    )
  }

  let body: React.ReactNode
  if (answered && result) {
    const final = answered.answers.find((a) => a.final)
    const teachingNext = view.pendingTeach === result.itemId || steps.some((s) => s.item.follows === result.itemId)
    const v = VERDICT[result.verdict] ?? VERDICT.incorrect
    body = (
      <div className="panel p-6 sm:p-7" aria-live="polite">
        <MathText text={answered.item.prompt} className="text-[1.05rem] text-ink-soft" />
        {!result.dontKnow && final && (
          <p className="mt-3 text-[0.95rem]">
            <span className="text-ink-soft">Your answer: </span>
            {final.answer}
          </p>
        )}
        <p className={`mt-4 font-display text-[1.45rem] ${v.tone}`}>
          {result.dontKnow ? 'That’s fine. Here’s how it works.' : v.title}
        </p>
        {result.feedback && !result.dontKnow && <p className="mt-1">{result.feedback}</p>}
        {result.uncertain && (
          <p className="mt-2 text-[0.92rem] text-ink-soft">
            The grading of this answer was uncertain, so it counts neither way.
          </p>
        )}
        {final?.solution && (
          <details className="mt-4" open={result.verdict !== 'correct' && !teachingNext}>
            <summary className="cursor-pointer text-forest underline underline-offset-4">How to solve it</summary>
            <MathText text={final.solution} className="mt-2 text-[0.98rem]" />
          </details>
        )}
        <button type="button" className="btn btn-primary mt-6" onClick={() => setResult(null)}>
          {teachingNext ? 'See the explanation' : view.current ? 'Next question' : 'See how it went'}
        </button>
      </div>
    )
  } else if (pending) {
    body = (
      <div className="panel p-6 sm:p-7" aria-live="polite">
        {teachError ? (
          <>
            <p role="alert">{teachError}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="btn btn-quiet" onClick={() => teach(pending)}>
                Try again
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  skippedRef.current = [...skippedRef.current, pending]
                  setSkipped(skippedRef.current)
                  setTeachError(null)
                }}
              >
                Go on without it
              </button>
            </div>
          </>
        ) : (
          <p className="flex items-center gap-3">
            <span className="spinner" aria-hidden="true" /> Theo is writing an explanation from your material and a new
            problem to try.
          </p>
        )}
      </div>
    )
  } else if (current) {
    const explanation =
      current.item.follows !== undefined
        ? steps.find((s) => s.item.type === 'explanation' && s.item.follows === current.item.follows)
        : undefined
    const number = questions.findIndex((q) => q.item.id === current.item.id) + 1
    body = (
      <>
        {explanation && <Explanation step={explanation} materials={view.materialTitles} />}
        <QuestionCard
          key={current.item.id}
          step={current}
          label={current.item.round ? 'New problem' : `Question ${number} of ${questions.length}`}
          skill={view.skillNames[current.item.skill_id]}
          answer={answer}
          setAnswer={setAnswer}
          hints={view.hints}
          hintsLeft={view.hintsLeft}
          clarify={clarify?.itemId === current.item.id ? clarify.message : null}
          busy={busy}
          onSubmit={submit}
          onHint={hint}
        />
      </>
    )
  } else {
    body = (
      <div className="panel p-6 sm:p-7">
        <p className="font-display text-[1.4rem]">That’s the whole Quick Check.</p>
        <button type="button" className="btn btn-primary mt-5" onClick={() => finish(false)} disabled={busy !== null}>
          {busy === 'finish' ? 'Closing' : 'See how it went'}
        </button>
      </div>
    )
  }

  return (
    <AppShell>
      {head}
      <div className="mt-8 max-w-2xl space-y-4">
        {error && (
          <p role="alert" className="rounded-xl border border-terracotta/40 bg-terracotta/5 px-4 py-3 text-terracotta">
            {error}
          </p>
        )}
        {body}
      </div>
    </AppShell>
  )
}

function Explanation({ step, materials }: { step: Step; materials: Record<number, string> }) {
  const source = step.item.sources?.[0]
  const where = source?.materialId ? materials[source.materialId] : null
  return (
    <section className="panel border-gold/60 p-6 sm:p-7" aria-label="Explanation">
      <p className="text-[0.9rem] font-medium text-gold-deep">
        {step.item.round === 2 ? 'Another way to see it' : 'Here’s the idea'}
      </p>
      <MathText text={step.item.prompt} className="mt-2 text-[1.02rem] leading-relaxed" />
      {source && (source.quote || source.pages?.length) && (
        <p className="mt-4 border-l-2 border-gold pl-3 text-[0.92rem] text-ink-soft">
          {where ? `${where}, ` : 'Your material, '}
          {source.pages?.length ? `page ${source.pages[0]}` : ''}
          {source.quote ? `: “${source.quote}”` : ''}
        </p>
      )}
    </section>
  )
}

function QuestionCard(props: {
  step: Step
  label: string
  skill: string
  answer: string
  setAnswer: (s: string) => void
  hints: string[]
  hintsLeft: number
  clarify: string | null
  busy: string | null
  onSubmit: (dontKnow?: boolean) => void
  onHint: () => void
}) {
  const { step, answer, setAnswer, busy } = props
  const item = step.item
  const disabled = busy !== null
  return (
    <section className="panel p-6 sm:p-7" aria-label={props.label}>
      <p className="text-[0.9rem] text-ink-soft">
        {props.label} · {props.skill}
      </p>
      <MathText text={item.prompt} className="mt-3 text-[1.15rem] leading-relaxed" />

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault()
          props.onSubmit(false)
        }}
      >
        {item.format === 'choice' && item.choices ? (
          <fieldset>
            <legend className="sr-only">Choose one answer</legend>
            <div className="space-y-2">
              {item.choices.map((choice, i) => {
                const letter = 'ABCDE'[i]
                const picked = answer === letter
                return (
                  <label
                    key={letter}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold ${
                      picked ? 'border-forest bg-forest/5' : 'border-line bg-[#fffdf8] hover:border-stone-deep'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`choice-${item.id}`}
                      value={letter}
                      checked={picked}
                      onChange={() => setAnswer(letter)}
                      disabled={disabled}
                      className="sr-only"
                    />
                    <span className="font-display text-[1.05rem] text-gold-deep" aria-hidden="true">
                      {letter}
                    </span>
                    <MathInline text={choice} />
                  </label>
                )
              })}
            </div>
          </fieldset>
        ) : item.format === 'short_text' ? (
          <textarea
            className="field min-h-28"
            aria-label="Your answer"
            placeholder="Answer in a sentence or two"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) props.onSubmit(false)
            }}
            disabled={disabled}
          />
        ) : (
          <input
            className="field max-w-xs"
            aria-label="Your answer"
            inputMode={item.format === 'number' ? 'decimal' : 'text'}
            placeholder="Your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={disabled}
            autoComplete="off"
          />
        )}

        {props.hints.length > 0 && (
          <ol className="mt-4 space-y-2">
            {props.hints.map((h, i) => (
              <li key={i} className="rounded-xl bg-ivory-deep/60 px-4 py-2.5 text-[0.95rem]">
                <span className="font-medium">Hint {i + 1}: </span>
                <MathInline text={h} />
              </li>
            ))}
          </ol>
        )}
        {props.clarify && (
          <p role="alert" className="mt-4 rounded-xl border border-gold/60 bg-gold/10 px-4 py-3">
            {props.clarify}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={disabled || !answer.trim()}>
            {busy === 'answer' ? (
              <>
                <span className="spinner" /> Checking
              </>
            ) : (
              'Check answer'
            )}
          </button>
          {props.hintsLeft > 0 && (
            <button type="button" className="btn btn-quiet" onClick={props.onHint} disabled={disabled}>
              {busy === 'hint' ? 'Getting a hint' : props.hints.length ? 'Another hint' : 'Show a hint'}
            </button>
          )}
          <button
            type="button"
            className="text-ink-soft underline underline-offset-4"
            onClick={() => props.onSubmit(true)}
            disabled={disabled}
          >
            I don’t know yet
          </button>
        </div>
        {props.hintsLeft > 0 && props.hints.length === 0 && (
          <p className="mt-3 text-[0.85rem] text-ink-soft">
            Hints are fine to use. An answer after a hint counts as practice rather than proof.
          </p>
        )}
      </form>
    </section>
  )
}
