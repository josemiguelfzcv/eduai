'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useRequiredUser } from '../AppShell'
import { useCourseWorkspace } from '../shell/academy'
import { HEADER, useShell } from '../shell/Shell'
import { startQuickCheck } from '../study/client'
import { clockQuery } from '../../lib/clock'
import { ApiError, getJSON } from '../../lib/supabase'
import type { LectureView } from '../../lib/views'
import { AskPanel, type AskContext } from './AskPanel'
import type { AskAbout } from './LessonDocument'
import { LessonView } from './LessonView'

/**
 * A lecture (or any course material) taught as a written lesson, with Ask Lyceo beside it in the shell. Used by the
 * lecture pages and, until the assignment workspace has its own tabs, by assignments.
 */
export function LectureWorkspace({
  courseId,
  lectureId,
  section = 'lectures',
}: {
  courseId: number
  lectureId: number
  /** Which part of the course its address lives under. */
  section?: 'lectures' | 'assignments'
}) {
  const user = useRequiredUser()
  const router = useRouter()
  const shell = useShell()
  const workspace = useCourseWorkspace()
  const [view, setView] = useState<LectureView | null>(null)
  const [problem, setProblem] = useState<{ status: number; message: string } | null>(null)
  const [askContext, setAskContext] = useState<AskContext | null>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    getJSON<LectureView>(`/api/lectures/${lectureId}?${clockQuery()}`).then(
      (v) => active && setView(v),
      (e) =>
        active &&
        setProblem({
          status: e instanceof ApiError ? e.status : 500,
          message: e instanceof Error ? e.message : 'Could not open this lecture.',
        }),
    )
    return () => {
      active = false
    }
  }, [user, lectureId])

  // A lecture opened under another course's address moves to its own course.
  useEffect(() => {
    const owner = view?.lecture.courseId
    if (owner && owner !== courseId) router.replace(`/courses/${owner}/${section}/${lectureId}`)
  }, [view, courseId, lectureId, router, section])

  const outline = view?.lesson?.outline
  const titles = useMemo(() => Object.fromEntries((outline ?? []).map((s) => [s.id, s.title])), [outline])
  const scrollRef = shell?.scrollRef

  // Ask Lyceo lives in the shell's right panel while this lecture is open.
  const setAside = shell?.setAside
  const closeAside = shell?.closeAside
  const messages = view?.messages
  useEffect(() => {
    if (!setAside || !closeAside || !messages) return
    /** The section at the top of the lesson column now. */
    const readingNow = () => {
      const scroll = scrollRef?.current
      if (!scroll || !outline?.length) return null
      const line = scroll.getBoundingClientRect().top + HEADER + 96
      let id = outline[0].id
      for (const el of scroll.querySelectorAll<HTMLElement>('[data-section]')) {
        if (el.getBoundingClientRect().top > line) break
        if (el.dataset.section && titles[el.dataset.section]) id = el.dataset.section
      }
      return id
    }
    setAside(
      <AskPanel
        key={lectureId}
        lectureId={lectureId}
        initial={messages}
        context={askContext}
        setContext={setAskContext}
        titles={titles}
        reading={outline?.length ? readingNow : null}
        onClose={closeAside}
      />,
    )
  }, [setAside, closeAside, lectureId, messages, askContext, titles, outline, scrollRef])
  useEffect(() => () => setAside?.(null), [setAside])

  const openAside = shell?.openAside
  const ask: AskAbout = (context) => {
    setAskContext(context)
    openAside?.()
  }

  const practice = async (skillIds: number[]) => {
    const sessionId = await startQuickCheck({ courseId, skillIds, mode: 'quick_check' })
    router.push(`/sessions/${sessionId}`)
  }

  if (!shell || !scrollRef) {
    // Outside the learning environment (it's off here): the material's own page still works.
    return (
      <p className="p-8">
        <Link href={`/materials/${lectureId}`}>Open this material</Link>
      </p>
    )
  }

  if (!view)
    return (
      <div className="mx-auto max-w-[52rem] px-5 pt-10 sm:px-9 lg:px-12">
        {problem ? (
          <div className="rounded-[20px] border border-[#ece3d3] bg-[#fffdf9] px-6 py-8">
            <h1 className="font-display text-[1.8rem]">
              {problem.status === 404 ? 'This lecture isn’t here' : 'Something went wrong'}
            </h1>
            <p className="mt-2 text-ink-soft">{problem.message}</p>
            <Link href={`/courses/${courseId}`} className="btn btn-primary mt-5 no-underline">
              Back to the course
            </Link>
          </div>
        ) : (
          <LectureSkeleton />
        )}
      </div>
    )

  return (
    <LessonView
      view={view}
      setView={setView}
      scrollRef={scrollRef}
      onAsk={ask}
      onPractice={practice}
      onProgress={() => workspace?.reload()}
    />
  )
}

function LectureSkeleton() {
  const bar = 'block animate-pulse rounded-lg bg-[#ebe3d4] motion-reduce:animate-none'
  return (
    <div aria-busy="true" aria-label="Opening the lecture">
      <span className={`${bar} h-4 w-32`} />
      <span className={`${bar} mt-3 h-9 w-2/3`} />
      <span className={`${bar} mt-6 h-2 w-full`} />
      <div className="mt-8 space-y-3 rounded-[20px] border border-[#ece3d3] bg-[#fffdf9] px-9 py-8">
        {[92, 100, 84, 96, 60].map((w, i) => (
          <span key={i} className={`${bar} h-4`} style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}
