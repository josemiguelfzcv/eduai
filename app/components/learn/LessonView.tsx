'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clockBody } from '../../lib/clock'
import type { LectureView } from '../../lib/views'
import type { OutlineSection, ReadingAnchor } from '../../lib/written-lesson'
import { postJSON } from '../../lib/supabase'
import { ArrowLeftIcon, ArrowRightIcon, ChatIcon, ClockIcon, PlayIcon, SparkleIcon } from './icons'
import { LaurelMark } from './LaurelMark'
import { SectionBody, type AskAbout } from './LessonDocument'
import { Breadcrumbs } from '../shell/Breadcrumbs'
import { postStream, putKeepalive } from './stream'
import { useReadingPosition } from './useReadingPosition'

// The main lesson. Lyceo teaches the lecture section by section: each section is written when the student reaches
// it (streamed, then kept) and the next one is prepared while they read. Everything read stays on the page, so the
// student can scroll back; the place they're reading is kept exactly, on this device and on the server.

type Props = {
  view: LectureView
  setView: (v: LectureView) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  onAsk: AskAbout
  onPractice: (skillIds: number[]) => Promise<void>
  /** Called when the lesson's progress changed, so the sidebar can update. */
  onProgress: () => void
}

export function LessonView({ view, setView, scrollRef, onAsk, onPractice, onProgress }: Props) {
  const lesson = view.lesson
  const lectureId = view.lecture.id
  // Each section's text as far as it has arrived, and which ones are complete.
  const [texts, setTexts] = useState<Record<string, string>>(lesson?.sections ?? {})
  const [finished, setFinished] = useState<ReadonlySet<string>>(() => new Set(Object.keys(lesson?.sections ?? {})))
  const [problem, setProblem] = useState<string | null>(null)
  const [completed, setCompleted] = useState<string[]>(lesson?.completed ?? [])
  const [current, setCurrent] = useState<string | null>(lesson?.currentSection ?? lesson?.outline[0]?.id ?? null)
  const [practicing, setPracticing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const inFlight = useRef(new Set<string>())
  const planning = useRef(false)

  const outline = useMemo(() => lesson?.outline ?? [], [lesson])
  const index = Math.max(
    0,
    outline.findIndex((s) => s.id === current),
  )
  const shown = outline.slice(0, index + 1)
  const next: OutlineSection | undefined = outline[index + 1]
  const section = outline[index]
  const writing = (id: string) => !finished.has(id) && !(id === section?.id && problem)

  // Plan the lesson the first time the lecture is opened.
  useEffect(() => {
    if (lesson || planning.current || view.lecture.status !== 'mapped') return
    planning.current = true
    postJSON<LectureView>(`/api/lectures/${lectureId}/lesson`, clockBody())
      .then((v) => {
        setView(v)
        setTexts(v.lesson?.sections ?? {})
        setFinished(new Set(Object.keys(v.lesson?.sections ?? {})))
        setCurrent(v.lesson?.currentSection ?? v.lesson?.outline[0]?.id ?? null)
      })
      .catch((e) => setProblem(e instanceof Error ? e.message : 'Could not plan this lesson.'))
      .finally(() => (planning.current = false))
  }, [lesson, view.lecture.status, lectureId, setView])

  /** Writes a section, its text arriving as it streams. A failure on the section being read is shown. */
  const write = useCallback(
    async (id: string, shown: boolean) => {
      inFlight.current.add(id)
      try {
        const text = await postStream(`/api/lectures/${lectureId}/sections/${id}`, clockBody(), (t) =>
          setTexts((all) => ({ ...all, [id]: t })),
        )
        setTexts((all) => ({ ...all, [id]: text }))
        setFinished((all) => new Set([...all, id]))
      } catch (e) {
        setTexts((all) => {
          const rest = { ...all }
          delete rest[id]
          return rest
        })
        if (shown) setProblem(e instanceof Error ? e.message : 'Could not write this section.')
      } finally {
        inFlight.current.delete(id)
      }
    },
    [lectureId],
  )

  // The section being read is written if it isn't yet; once it is, the next one is prepared quietly.
  useEffect(() => {
    if (!lesson || !section || problem) return
    if (!finished.has(section.id)) {
      if (!inFlight.current.has(section.id)) write(section.id, true)
    } else if (next && !finished.has(next.id) && !inFlight.current.has(next.id)) write(next.id, false)
  }, [lesson, section, next, finished, problem, write])

  const save = useCallback(
    (body: { currentSection?: string; completed?: string[]; position?: ReadingAnchor }) =>
      putKeepalive(`/api/lectures/${lectureId}/progress`, body),
    [lectureId],
  )

  const reading = useReadingPosition({
    scrollRef,
    contentRef,
    storageKey: `lyceo.lesson.${lectureId}.place`,
    saved: lesson?.position ?? null,
    ready: !!lesson && shown.every((s) => !!texts[s.id] || writing(s.id)),
    onSave: (position) => save({ position }),
  })

  const goOn = () => {
    if (!section) return
    const done = [...new Set([...completed, section.id])]
    setCompleted(done)
    if (next) {
      setCurrent(next.id)
      window.requestAnimationFrame(() => reading.goTo(`${next.id}-title`, next.id))
    }
    save(next ? { currentSection: next.id, completed: done } : { completed: done }).then(onProgress)
  }

  const practice = async () => {
    setPracticing(true)
    try {
      await onPractice(section?.skillIds.length ? section.skillIds : view.skills.map((s) => s.id))
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not start the practice.')
      setPracticing(false)
    }
  }

  // Ask about a selected passage.
  const [selection, setSelection] = useState<{ top: number; left: number; quote: string; sectionId: string } | null>(
    null,
  )
  const onSelect = () => {
    const sel = window.getSelection()
    const scroll = scrollRef.current
    const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? ''
    if (!sel || !scroll || text.length < 3 || !contentRef.current?.contains(sel.anchorNode)) return setSelection(null)
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    const box = scroll.getBoundingClientRect()
    const anchorEl = (
      sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
    )?.closest<HTMLElement>('[data-section]')
    // Above the selection, or below it when it starts at the top of the view.
    const above = rect.top - box.top > 56
    setSelection({
      top: (above ? rect.top - 46 : rect.bottom + 8) - box.top + scroll.scrollTop,
      left: Math.min(Math.max(rect.left - box.left + rect.width / 2, 80), box.width - 80),
      quote: text.slice(0, 1500),
      sectionId: anchorEl?.dataset.section ?? current ?? 's1',
    })
  }

  const total = outline.length
  const doneCount = completed.filter((id) => outline.some((s) => s.id === id)).length
  const minutesLeft = outline.filter((s) => !completed.includes(s.id)).reduce((n, s) => n + s.minutes, 0)
  const courseId = view.lecture.courseId

  return (
    <div className="relative px-8 pb-12 pt-5" onMouseUp={onSelect} onKeyUp={onSelect}>
      <div className="mx-auto max-w-[60rem]">
        <Breadcrumbs className="mb-4" />
        <header>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.86rem] text-ink-soft">
                {view.number
                  ? `Lecture ${view.number} of ${view.total}`
                  : view.lecture.role === 'assignment'
                    ? 'Assignment'
                    : view.lecture.role === 'reading'
                      ? 'Reading'
                      : 'Material'}
              </p>
              <h1 className="mt-1 font-display text-[clamp(1.55rem,2.3vw,2.05rem)] font-bold leading-[1.15] tracking-[-0.015em] text-[#1d1c19]">
                {view.lecture.title}
              </h1>
            </div>
            <div className="flex shrink-0 gap-2.5 pt-0.5">
              <NeighborLink
                courseId={courseId}
                id={view.prevId}
                label="Previous lecture"
                icon={<ArrowLeftIcon size={18} />}
              />
              <NeighborLink
                courseId={courseId}
                id={view.nextId}
                label="Next lecture"
                icon={<ArrowRightIcon size={18} />}
              />
            </div>
          </div>
          {total > 0 && (
            <div className="mt-3.5 flex items-center gap-5">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-[#ebdfcf]"
                role="progressbar"
                aria-label="Lesson progress"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={doneCount}
                aria-valuetext={`${doneCount} of ${total} sections read`}
              >
                <div
                  className="h-full rounded-full bg-grove-soft transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${(doneCount / total) * 100}%` }}
                />
              </div>
              <p className="flex shrink-0 items-center gap-1.5 text-[0.88rem] font-semibold text-[#1d1c19]">
                <ClockIcon size={17} />
                {minutesLeft ? `${minutesLeft} min` : 'Done'}
                <span className="sr-only">{minutesLeft ? ' left in this lecture' : ''}</span>
              </p>
            </div>
          )}
        </header>

        <div ref={contentRef} className="mt-5">
          {view.lecture.status !== 'mapped' ? (
            <Notice>
              Lyceo is still reading this material.{' '}
              <Link href={`/materials/${view.lecture.id}`} className="text-grove underline underline-offset-4">
                See its progress
              </Link>
            </Notice>
          ) : !lesson ? (
            <Notice>
              {problem ?? (
                <span className="flex items-center gap-3">
                  <span className="spinner" aria-hidden="true" /> Lyceo is planning this lesson from your lecture. It
                  takes about half a minute.
                </span>
              )}
            </Notice>
          ) : (
            <article className="rounded-[18px] border border-[#eee3d2] bg-[#fffaf3] px-4 py-5 shadow-[0_3px_18px_-8px_rgba(95,65,25,0.2)] sm:px-6 sm:py-6">
              <div className="sm:grid sm:grid-cols-[34px_minmax(0,1fr)] sm:gap-x-3.5">
                <LaurelMark size={34} className="hidden text-grove sm:block" />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 pt-1 text-[0.86rem] font-semibold text-[#1d1c19]">
                    <LaurelMark size={26} className="text-grove sm:hidden" /> Lyceo
                  </p>
                  <div className="mt-2 space-y-10">
                    {shown.map((s, i) => (
                      <section
                        key={s.id}
                        aria-labelledby={`${s.id}-title`}
                        className="group/box"
                        // The section being read can always come up to the top of the view, even while it's short
                        // (still being written): the space below it fills as it arrives.
                        style={
                          i === shown.length - 1 && shown.length > 1 ? { minHeight: 'calc(100dvh - 15rem)' } : undefined
                        }
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <h2
                            id={`${s.id}-title`}
                            data-block={`${s.id}-title`}
                            data-section={s.id}
                            className="font-display text-[1.3rem] font-semibold leading-snug text-[#1d1c19]"
                          >
                            {s.title}
                          </h2>
                          {texts[s.id] && (
                            <button
                              type="button"
                              onClick={() => onAsk({ sectionId: s.id })}
                              aria-label={`Ask about this: ${s.title}`}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[0.78rem] font-medium text-grove opacity-100 transition-opacity hover:bg-grove/[0.07] sm:px-2.5 sm:py-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-hover/box:opacity-100"
                            >
                              <ChatIcon size={16} />
                              <span className="hidden sm:inline">Ask about this</span>
                            </button>
                          )}
                        </div>
                        <div className="mt-3">
                          {texts[s.id] ? (
                            <SectionBody sectionId={s.id} text={texts[s.id]} onAsk={onAsk} />
                          ) : writing(s.id) ? (
                            <p className="flex items-center gap-3 text-[0.92rem] text-ink-soft">
                              <span className="spinner" aria-hidden="true" /> Lyceo is writing this section
                            </p>
                          ) : null}
                          {writing(s.id) && texts[s.id] && (
                            <p className="mt-4 flex items-center gap-2 text-[0.86rem] text-ink-soft" aria-live="polite">
                              <span className="spinner" aria-hidden="true" /> Writing
                            </p>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>

                  {problem && (
                    <div role="alert" className="mt-8 border-l-2 border-terracotta pl-4">
                      <p className="text-terracotta">{problem}</p>
                      <button
                        type="button"
                        className="mt-2 text-[0.92rem] text-grove underline underline-offset-4"
                        onClick={() => setProblem(null)}
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {section && finished.has(section.id) && (
                    <div className="mt-9 flex flex-wrap items-center gap-3">
                      {next ? (
                        <button type="button" onClick={goOn} className={PRIMARY}>
                          <PlayIcon size={17} /> Continue: {next.title}
                        </button>
                      ) : completed.includes(section.id) ? (
                        view.nextId && courseId ? (
                          <Link
                            href={`/courses/${courseId}/lectures/${view.nextId}`}
                            className={`${PRIMARY} no-underline`}
                          >
                            <PlayIcon size={17} /> Next lecture
                          </Link>
                        ) : (
                          <p className="font-display text-[1.1rem] text-grove">You’ve read the whole lecture.</p>
                        )
                      ) : (
                        <button type="button" onClick={goOn} className={PRIMARY}>
                          <PlayIcon size={17} /> Finish the lecture
                        </button>
                      )}
                      {view.skills.length > 0 && (
                        <button type="button" onClick={practice} disabled={practicing} className={SECONDARY}>
                          {practicing ? (
                            <>
                              <span className="spinner" aria-hidden="true" /> Writing questions
                            </>
                          ) : (
                            <>
                              <span className="text-gold">
                                <SparkleIcon size={17} />
                              </span>
                              Practice this section
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </article>
          )}
        </div>
      </div>

      {selection && (
        <button
          type="button"
          style={{ top: selection.top, left: selection.left }}
          className="absolute z-10 -translate-x-1/2 rounded-full bg-grove px-4 py-2 text-[0.86rem] font-medium text-ivory shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onAsk({ sectionId: selection.sectionId, quote: selection.quote })
            setSelection(null)
          }}
        >
          Ask about this
        </button>
      )}
    </div>
  )
}

const PRIMARY =
  'inline-flex items-center gap-2.5 rounded-full bg-grove px-6 py-3 text-[0.9rem] font-semibold text-ivory shadow-[0_6px_16px_-8px_rgba(20,45,20,0.7)] transition-colors hover:bg-grove-soft disabled:opacity-60'
const SECONDARY =
  'inline-flex items-center gap-2.5 rounded-full border border-[#dcc9a3] bg-[#fffbf4] px-6 py-3 text-[0.9rem] font-semibold text-grove transition-colors hover:border-gold disabled:opacity-60'

function NeighborLink({
  courseId,
  id,
  label,
  icon,
}: {
  courseId: number | null
  id: number | null
  label: string
  icon: React.ReactNode
}) {
  const look =
    'grid size-10 place-items-center rounded-full border border-[#e2d5bf] bg-[#fffaf2] text-[#1d1c19] shadow-[0_1px_2px_rgba(80,60,30,0.08)] transition-colors'
  if (!id || !courseId)
    return (
      <span aria-hidden="true" className={`${look} opacity-35`}>
        {icon}
      </span>
    )
  return (
    <Link
      href={`/courses/${courseId}/lectures/${id}`}
      aria-label={label}
      title={label}
      className={`${look} hover:border-gold`}
    >
      {icon}
    </Link>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[#eee3d2] bg-[#fffaf3] px-6 py-8 text-[0.98rem] shadow-[0_3px_18px_-8px_rgba(95,65,25,0.2)]">
      {children}
    </div>
  )
}
