'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lesson, Personalization } from '../lib/lesson'
import { postJSON, signInWithGoogle } from '../lib/supabase'
import { Board } from './Board'
import { Theo } from './Theo'

type Phase = 'ready' | 'loading' | 'playing' | 'paused' | 'asking' | 'grading' | 'feedback' | 'done'

type Grade = {
  correct: boolean
  feedback: string
  reexplanation: string
  reexplanationBoard: string[]
  reexplanationAudio: string | null
}

type Result = { attempts: number; firstTryCorrect: boolean | null }

const WORDS_PER_SECOND = 2.6

export function LessonPlayer({
  lesson,
  courseId,
  demo = false,
  startAt = 0,
}: {
  lesson: Lesson
  courseId?: number
  demo?: boolean
  /** 0-based part to pick up from (from My Academy's "Continue"). */
  startAt?: number
}) {
  const segments = lesson.segments
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startAt), lesson.segments.length - 1))
  // Parts before this one were covered in an earlier session.
  const [from, setFrom] = useState(index)
  const [phase, setPhase] = useState<Phase>('ready')
  const [revealed, setRevealed] = useState(0)
  const [boardOverride, setBoardOverride] = useState<string[] | null>(null)
  const [answer, setAnswer] = useState('')
  const [grade, setGrade] = useState<Grade | null>(null)
  const [reexplaining, setReexplaining] = useState(false)
  const [results, setResults] = useState<Record<number, Result>>({})
  const [urls, setUrls] = useState<(string | null)[] | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const prefetched = useRef(new Map<string, Promise<string | null>>())
  const askedAt = useRef(0)

  const segment = segments[index]
  const boardLines = boardOverride ?? segment.board

  // Sign every narration up front so playback can start the moment the student presses play.
  useEffect(() => {
    let cancelled = false
    postJSON<{ urls: (string | null)[] }>('/api/speak', { texts: segments.map((s) => s.narration), demo })
      .then((r) => !cancelled && setUrls(r.urls))
      .catch(() => {
        if (cancelled) return
        setUrls(segments.map(() => null))
        setVoiceError("Theo's voice isn't available right now, so you'll read along instead.")
      })
    return () => {
      cancelled = true
    }
  }, [segments, demo])

  useEffect(() => {
    const cache = prefetched.current
    return () => {
      audioRef.current?.pause()
      cache.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)))
    }
  }, [])

  /** Downloads the next part's audio while the current one plays, so it starts instantly. */
  const prefetch = useCallback((url: string | null | undefined) => {
    if (!url || prefetched.current.has(url)) return
    const job = fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null)
    prefetched.current.set(url, job)
  }, [])

  const playAudio = useCallback(
    async (url: string, text: string, lineCount: number, on: { start?: () => void; end: () => void }) => {
      audioRef.current ??= new Audio()
      const el = audioRef.current
      el.pause()
      const local = prefetched.current.has(url) ? await prefetched.current.get(url) : null
      el.src = local ?? url

      const estimate = text.split(/\s+/).length / WORDS_PER_SECOND
      el.ontimeupdate = () => {
        const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : estimate
        setRevealed(Math.min(lineCount, 1 + Math.floor((el.currentTime / duration) * lineCount * 1.15)))
      }
      el.onplaying = () => on.start?.()
      el.onended = () => {
        setRevealed(lineCount)
        on.end()
      }
      el.onerror = () => {
        setVoiceError("Theo's voice didn't load for this part, so the transcript is open below.")
        setShowTranscript(true)
        setRevealed(lineCount)
        on.end()
      }
      el.play().catch(() => setPhase((p) => (p === 'loading' ? 'paused' : p)))
    },
    [],
  )

  const askNow = useCallback(() => {
    askedAt.current = Date.now()
    setPhase('asking')
  }, [])

  const playSegment = useCallback(
    (i: number) => {
      const seg = segments[i]
      setIndex(i)
      setGrade(null)
      setAnswer('')
      setError(null)
      setBoardOverride(null)
      setReexplaining(false)

      const url = urls?.[i]
      if (!url) {
        setRevealed(seg.board.length)
        setShowTranscript(true)
        askNow()
        return
      }
      setRevealed(1)
      setPhase('loading')
      playAudio(url, seg.narration, seg.board.length, { start: () => setPhase('playing'), end: askNow })
      prefetch(urls?.[i + 1])
    },
    [segments, urls, playAudio, prefetch, askNow],
  )

  const stopAudio = () => {
    audioRef.current?.pause()
    setReexplaining(false)
  }

  const togglePause = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.play()
        .then(() => setPhase('playing'))
        .catch(() => {})
    } else {
      el.pause()
      setPhase('paused')
    }
  }

  const skipToQuestion = () => {
    stopAudio()
    setRevealed(boardLines.length)
    askNow()
  }

  const submit = async () => {
    if (!answer.trim() || phase === 'grading') return
    setPhase('grading')
    setError(null)
    try {
      const g = await postJSON<Grade>('/api/check-answer', {
        demo,
        courseId,
        segmentIndex: index,
        answer,
        timeToAnswer: (Date.now() - askedAt.current) / 1000,
      })
      setResults((r) => {
        const prev = r[index] ?? { attempts: 0, firstTryCorrect: null }
        return { ...r, [index]: { attempts: prev.attempts + 1, firstTryCorrect: prev.firstTryCorrect ?? g.correct } }
      })
      setGrade(g)
      setPhase('feedback')

      if (!g.correct && g.reexplanation) {
        const lines = g.reexplanationBoard
        if (lines.length) setBoardOverride(lines)
        if (g.reexplanationAudio) {
          setRevealed(lines.length ? 1 : boardLines.length)
          setReexplaining(true)
          playAudio(g.reexplanationAudio, g.reexplanation, lines.length || boardLines.length, {
            end: () => setReexplaining(false),
          })
        } else {
          setRevealed(lines.length || boardLines.length)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check your answer.')
      setPhase('asking')
    }
  }

  const tryAgain = () => {
    stopAudio()
    setRevealed(boardLines.length)
    setGrade(null)
    setAnswer('')
    askNow()
  }

  const next = () => {
    stopAudio()
    if (index + 1 < segments.length) playSegment(index + 1)
    else setPhase('done')
  }

  if (phase === 'done') {
    return <Summary lesson={lesson} results={results} from={from} demo={demo} courseId={courseId} />
  }

  const isLast = index === segments.length - 1
  const narrating = phase === 'loading' || phase === 'playing' || phase === 'paused'
  const showCheck = phase === 'asking' || phase === 'grading' || phase === 'feedback'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[clamp(1.6rem,3.4vw,2.4rem)]">{lesson.title}</h1>
        <p className="mt-2 text-ink-soft">
          Part {index + 1} of {segments.length}: <span className="font-medium text-ink">{segment.concept}</span>
        </p>
        <Progress count={segments.length} index={index} results={results} from={from} />
      </div>

      <div className="relative">
        <Board
          lines={phase === 'ready' ? [] : boardLines}
          revealed={revealed}
          className="min-h-[300px] sm:min-h-[380px]"
        >
          {phase === 'ready' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="max-w-md font-chalk text-[1.7rem] leading-snug text-chalk">
                {segments.length === 1 ? 'One part' : `${segments.length} parts`}, about {lesson.estimatedMinutes}{' '}
                minutes. Theo checks in after each one.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  className="btn btn-gold px-6 py-3 text-[1.05rem]"
                  onClick={() => playSegment(index)}
                  disabled={!urls}
                >
                  {!urls ? 'Getting Theo ready' : index > 0 ? `Continue from part ${index + 1}` : 'Start the lesson'}
                </button>
                {index > 0 && urls && (
                  <button
                    className="btn border border-chalk/40 px-5 py-3 text-chalk hover:border-chalk/70"
                    onClick={() => {
                      setFrom(0)
                      playSegment(0)
                    }}
                  >
                    Start from the beginning
                  </button>
                )}
              </div>
            </div>
          )}
        </Board>
        <Theo
          size={112}
          speaking={phase === 'playing' || reexplaining}
          className="pointer-events-none absolute -bottom-12 right-2 sm:-right-10"
        />
      </div>

      <div className="mt-16 flex flex-wrap items-center gap-3">
        {narrating && (
          <>
            <button className="btn btn-primary min-w-[7.5rem]" onClick={togglePause} disabled={phase === 'loading'}>
              {phase === 'loading' ? (
                <>
                  <span className="spinner" /> Loading
                </>
              ) : phase === 'paused' ? (
                'Resume'
              ) : (
                'Pause'
              )}
            </button>
            <button className="btn btn-quiet" onClick={() => playSegment(index)}>
              Start this part over
            </button>
            {segment.check.question && (
              <button className="btn btn-quiet" onClick={skipToQuestion}>
                Skip to the question
              </button>
            )}
          </>
        )}
        {showCheck && (
          <button className="btn btn-quiet" onClick={() => playSegment(index)} disabled={phase === 'grading'}>
            Hear this part again
          </button>
        )}
        {phase !== 'ready' && (
          <button
            className="ml-auto rounded text-forest underline decoration-1 underline-offset-4"
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
          >
            {showTranscript ? 'Hide transcript' : 'Show transcript'}
          </button>
        )}
      </div>

      {voiceError && <p className="mt-4 text-terracotta">{voiceError}</p>}

      {showTranscript && phase !== 'ready' && (
        <div className="mt-4 max-w-[68ch] border-l-2 border-gold pl-4 text-ink-soft">
          <p>{segment.narration}</p>
          {grade?.reexplanation && <p className="mt-3">{grade.reexplanation}</p>}
        </div>
      )}

      {showCheck && (
        <section className="panel mt-8 p-6" aria-live="polite">
          {segment.check.question ? (
            <h2 className="max-w-[60ch] text-[1.3rem]">{segment.check.question}</h2>
          ) : (
            <h2 className="text-[1.3rem]">That&apos;s the end of this part.</h2>
          )}

          {segment.check.question && phase !== 'feedback' && (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <label htmlFor="answer" className="sr-only">
                Your answer
              </label>
              <textarea
                id="answer"
                className="field min-h-[5.5rem] resize-y"
                placeholder="Answer in your own words. A number or a short sentence is fine."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                disabled={phase === 'grading'}
                autoFocus
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="submit" className="btn btn-primary" disabled={!answer.trim() || phase === 'grading'}>
                  {phase === 'grading' ? (
                    <>
                      <span className="spinner" /> Checking
                    </>
                  ) : (
                    'Check my answer'
                  )}
                </button>
                <button type="button" className="btn btn-quiet" onClick={next} disabled={phase === 'grading'}>
                  {isLast ? 'Finish without answering' : 'Skip this question'}
                </button>
              </div>
              {error && <p className="mt-3 text-terracotta">{error}</p>}
            </form>
          )}

          {!segment.check.question && (
            <button className="btn btn-primary mt-4" onClick={next}>
              {isLast ? 'Finish the lesson' : 'Next part'}
            </button>
          )}

          {phase === 'feedback' && grade && (
            <div className="mt-4">
              <p className="text-ink-soft">
                You answered: <span className="text-ink">{answer}</span>
              </p>
              <div className={`mt-4 border-l-4 pl-4 ${grade.correct ? 'border-moss' : 'border-terracotta'}`}>
                <p className={`font-bold ${grade.correct ? 'text-moss' : 'text-terracotta'}`}>
                  {grade.correct ? 'You got it.' : 'Not quite yet.'}
                </p>
                <p className="mt-1 max-w-[65ch]">{grade.feedback}</p>
                {!grade.correct && grade.reexplanation && (
                  <p className="mt-3 flex items-center gap-2 text-ink-soft">
                    {reexplaining ? (
                      <>
                        <span className="spinner text-gold-deep" /> Theo is explaining it another way. Watch the board.
                      </>
                    ) : (
                      'Theo explained it another way on the board. Give it another try.'
                    )}
                  </p>
                )}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {grade.correct ? (
                  <button className="btn btn-primary" onClick={next} autoFocus>
                    {isLast ? 'Finish the lesson' : 'Next part'}
                  </button>
                ) : (
                  <>
                    <button className="btn btn-primary" onClick={tryAgain}>
                      Try again
                    </button>
                    <button className="btn btn-quiet" onClick={next}>
                      {isLast ? 'Finish the lesson' : 'Move on'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {!demo && lesson.meta?.personalization && <TailoredNote p={lesson.meta.personalization} />}
    </div>
  )
}

function Progress({
  count,
  index,
  results,
  from,
}: {
  count: number
  index: number
  results: Record<number, Result>
  from: number
}) {
  return (
    <ol className="mt-4 flex gap-1.5" aria-label="Lesson progress">
      {Array.from({ length: count }, (_, i) => {
        const r = results[i]?.firstTryCorrect
        const earlier = r === undefined && i < from
        const color =
          r === true
            ? 'bg-moss'
            : r === false
              ? 'bg-terracotta'
              : i === index
                ? 'bg-gold'
                : earlier
                  ? 'bg-stone-deep'
                  : 'bg-line'
        const label =
          r === true
            ? 'got it first try'
            : r === false
              ? 'needed help'
              : i === index
                ? 'current'
                : earlier
                  ? 'covered in an earlier session'
                  : 'not started'
        return (
          <li key={i} className={`h-1.5 flex-1 rounded-full ${color}`}>
            <span className="sr-only">
              Part {i + 1}: {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const STYLE_PHRASE: Record<string, string> = {
  analogias: 'leans on analogies and everyday examples',
  formal: 'keeps things formal and structured',
  codigo: 'explains ideas through code',
  visual: 'builds the idea visually on the board',
}

const PACE_PHRASE: Record<Personalization['pace'], string> = {
  gentle: 'in smaller steps',
  steady: 'at a steady pace',
  brisk: 'at a brisk pace',
}

function TailoredNote({ p }: { p: Personalization }) {
  const parts = [
    p.styleId && STYLE_PHRASE[p.styleId] ? STYLE_PHRASE[p.styleId] : null,
    p.major ? `uses examples from ${p.major}` : null,
    `moves ${PACE_PHRASE[p.pace]}`,
  ].filter(Boolean)
  return (
    <p className="mt-10 max-w-[70ch] text-[0.95rem] text-ink-soft">
      Written for you: this lesson {parts.join(', ')}
      {p.focusConcepts.length ? `, and takes extra care with ${p.focusConcepts.slice(0, 2).join(' and ')}` : ''}.{' '}
      <Link href="/profile" className="text-forest underline underline-offset-4">
        Change how Theo teaches you
      </Link>
    </p>
  )
}

function Summary({
  lesson,
  results,
  from,
  demo,
  courseId,
}: {
  lesson: Lesson
  results: Record<number, Result>
  from: number
  demo: boolean
  courseId?: number
}) {
  const router = useRouter()
  const [reviewing, setReviewing] = useState<'idle' | 'working' | string>('idle')
  const answered = lesson.segments.map((_, i) => i).filter((i) => results[i])
  const firstTry = answered.filter((i) => results[i].firstTryCorrect).length
  const missed = lesson.segments.filter((_, i) => results[i]?.firstTryCorrect === false)

  const review = async () => {
    setReviewing('working')
    try {
      const { courseId: id } = await postJSON<{ courseId: number }>('/api/review', { courseId })
      router.push(`/class/${id}`)
    } catch (e) {
      setReviewing(e instanceof Error ? e.message : 'Could not build the review.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Theo size={132} className="mx-auto" />
      <h1 className="mt-8 text-center text-[clamp(1.7rem,3.4vw,2.4rem)]">You finished the lesson</h1>
      <p className="mt-3 text-center text-ink-soft">
        {answered.length
          ? `${from > 0 ? 'This session, you' : 'You'} got ${firstTry} of ${answered.length} ${answered.length === 1 ? 'check-in' : 'check-ins'} right on the first try.`
          : 'You skipped the check-ins this time. Answering them is how Theo learns what to explain differently.'}
      </p>

      <ul className="panel mt-8 divide-y divide-line">
        {lesson.segments.map((s, i) => {
          const r = results[i]?.firstTryCorrect
          return (
            <li key={i} className="flex items-center justify-between gap-4 px-5 py-3">
              <span>{s.concept}</span>
              <span
                className={`text-[0.95rem] ${r === true ? 'text-moss' : r === false ? 'text-terracotta' : 'text-ink-soft'}`}
              >
                {r === true
                  ? 'Got it first try'
                  : r === false
                    ? 'Needed a second explanation'
                    : i < from
                      ? 'Covered earlier'
                      : 'Skipped'}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {demo ? (
          <>
            <button className="btn btn-gold" onClick={() => signInWithGoogle()}>
              Sign in to learn from your own notes
            </button>
            <button className="btn btn-quiet" onClick={() => window.location.reload()}>
              Take the demo again
            </button>
          </>
        ) : (
          <>
            {missed.length > 0 && (
              <button className="btn btn-primary" onClick={review} disabled={reviewing === 'working'}>
                {reviewing === 'working' ? (
                  <>
                    <span className="spinner" /> Theo is writing your review
                  </>
                ) : (
                  `Review the ${missed.length === 1 ? 'part' : `${missed.length} parts`} I missed`
                )}
              </button>
            )}
            <Link href="/dashboard" className="btn btn-quiet no-underline">
              Back to My Academy
            </Link>
          </>
        )}
      </div>
      {reviewing !== 'idle' && reviewing !== 'working' && (
        <p className="mt-4 text-center text-terracotta">{reviewing}</p>
      )}

      {demo && (
        <p className="mx-auto mt-10 max-w-[60ch] text-center text-ink-soft">
          With an account, Theo builds lessons from your own slides and recordings, remembers which ideas needed a
          second explanation, and writes review lessons on exactly those.
        </p>
      )}
    </div>
  )
}
