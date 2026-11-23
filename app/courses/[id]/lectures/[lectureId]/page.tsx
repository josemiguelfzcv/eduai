'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useRequiredUser } from '../../../../components/AppShell'
import { AskPanel, type AskContext } from '../../../../components/learn/AskPanel'
import type { AskAbout } from '../../../../components/learn/LessonDocument'
import { LessonView } from '../../../../components/learn/LessonView'
import { useLearnShell } from '../../../../components/learn/shell'
import { useCourseWorkspace } from '../../../../components/learn/workspace'
import { startQuickCheck } from '../../../../components/study/client'
import { clockQuery } from '../../../../lib/clock'
import { ApiError, getJSON } from '../../../../lib/supabase'
import type { LectureView } from '../../../../lib/views'

/** One lecture of a course, taught as a written lesson, with Ask Lyceo beside it. */
export default function LecturePage() {
  const params = useParams<{ id: string; lectureId: string }>()
  // A new lecture starts fresh: its own lesson, place and conversation.
  return <Lecture key={params.lectureId} courseId={Number(params.id)} lectureId={Number(params.lectureId)} />
}

function Lecture({ courseId, lectureId }: { courseId: number; lectureId: number }) {
  const user = useRequiredUser()
  const router = useRouter()
  const shell = useLearnShell()
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
    if (owner && owner !== courseId) router.replace(`/courses/${owner}/lectures/${lectureId}`)
  }, [view, courseId, lectureId, router])

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
      const line = scroll.getBoundingClientRect().top + 96
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
