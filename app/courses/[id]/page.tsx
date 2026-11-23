'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { AppShell, LoadingNote, useRequiredUser } from '../../components/AppShell'
import { useCourseWorkspace } from '../../components/learn/workspace'
import { CourseForm } from '../../components/academy/CourseForm'
import { Deadlines } from '../../components/academy/Deadlines'
import { plural } from '../../components/academy/format'
import { LessonRows } from '../../components/academy/LessonRows'
import { SetupNotice } from '../../components/academy/SetupNotice'
import { TodayPlan } from '../../components/academy/TodayPlan'
import { StateChip } from '../../components/study/Closure'
import { startQuickCheck } from '../../components/study/client'
import { type CourseDetail } from '../../lib/academy'
import { clockQuery } from '../../lib/clock'
import { ApiError, deleteJSON, getJSON } from '../../lib/supabase'

/** One course: what to do next in it, its lessons and progress, and its deadlines. */
export default function CoursePage() {
  const user = useRequiredUser()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const [detail, setDetail] = useState<CourseDetail | null>(null)
  const [problem, setProblem] = useState<{ status: number; message: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchDetail = useCallback(() => getJSON<CourseDetail>(`/api/academy/courses/${id}?${clockQuery()}`), [id])
  const [starting, setStarting] = useState<'quick_check' | 'guided_review' | null>(null)
  const startSession = async (mode: 'quick_check' | 'guided_review') => {
    setStarting(mode)
    try {
      router.push(`/sessions/${await startQuickCheck({ courseId: id, mode })}`)
    } catch (e) {
      setProblem({ status: 500, message: e instanceof Error ? e.message : 'Could not start the session.' })
      setStarting(null)
    }
  }
  const showDetail = useCallback((data: CourseDetail) => {
    setDetail(data)
    setProblem(null)
  }, [])
  const showProblem = useCallback((e: unknown) => {
    setProblem({
      status: e instanceof ApiError ? e.status : 500,
      message: e instanceof Error ? e.message : 'Could not load the course.',
    })
  }, [])
  // Inside the learning environment, the sidebar shows the course too: it reloads with the page.
  const workspace = useCourseWorkspace()
  const reloadWorkspace = workspace?.reload
  const load = useCallback(() => {
    reloadWorkspace?.()
    return fetchDetail().then(showDetail, showProblem)
  }, [fetchDetail, showDetail, showProblem, reloadWorkspace])

  useEffect(() => {
    if (user) fetchDetail().then(showDetail, showProblem)
  }, [user, fetchDetail, showDetail, showProblem])

  const remove = async () => {
    setDeleting(true)
    try {
      await deleteJSON(`/api/academy/courses/${id}`)
      router.push('/dashboard')
    } catch (e) {
      setProblem({ status: 500, message: e instanceof Error ? e.message : 'Could not delete the course.' })
      setDeleting(false)
    }
  }

  if (!detail) {
    return (
      <AppShell wide>
        {!problem ? (
          <LoadingNote>Opening the course</LoadingNote>
        ) : problem.status === 503 ? (
          <SetupNotice />
        ) : (
          <div className="max-w-xl">
            <h1 className="text-[2rem]">
              {problem.status === 404 ? 'This course doesn’t exist' : 'Something went wrong'}
            </h1>
            <p className="mt-3 text-ink-soft">{problem.message}</p>
            <Link href="/dashboard" className="btn btn-primary mt-6 no-underline">
              Back to My Academy
            </Link>
          </div>
        )}
      </AppShell>
    )
  }

  const { course } = detail
  const lessons = detail.lessons.filter((l) => l.status !== 'not-ready')
  const loop = !!detail.learningLoop
  const uploadHref = loop ? `/materials/new?course=${course.id}` : `/upload?course=${course.id}`
  const ideas = detail.ideas ?? []
  const materials = detail.materials ?? []
  const toPractice = ideas.filter((i) => i.state !== 'confirmed').length

  return (
    <AppShell wide>
      {!workspace && (
        <Link href="/dashboard" className="text-[0.9rem] text-ink-soft no-underline hover:text-ink">
          My Academy
        </Link>
      )}
      <header className={`${workspace ? '' : 'mt-3 '}flex flex-wrap items-end justify-between gap-5`}>
        <div>
          <h1 className="text-[clamp(2.1rem,4vw,3rem)]">{course.name}</h1>
          <p className="mt-1 text-ink-soft">{[course.code, course.term].filter(Boolean).join(', ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
            Edit course
          </button>
          <Link href={uploadHref} className="btn btn-primary no-underline">
            Add material
          </Link>
        </div>
      </header>
      {problem && (
        <p
          role="alert"
          className="mt-4 max-w-2xl rounded-xl border border-terracotta/40 bg-terracotta/5 px-4 py-3 text-terracotta"
        >
          {problem.message}
        </p>
      )}

      {editing && (
        <div className="mt-6 max-w-xl">
          <CourseForm
            course={course}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false)
              load()
            }}
          />
        </div>
      )}

      {/* Same ordering as My Academy: next steps, then deadlines, then lessons on phones. */}
      <div className="mt-10 flex flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
        <div className="contents lg:block lg:min-w-0 lg:space-y-14">
          {detail.plan.length > 0 && (
            <section aria-labelledby="next-title" className="order-1">
              <h2 id="next-title" className="text-[1.6rem]">
                Next for this course
              </h2>
              <div className="mt-5">
                <TodayPlan plan={detail.plan} showCourse={false} />
              </div>
            </section>
          )}

          {loop && (
            <section aria-labelledby="ideas-title" className="order-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 id="ideas-title" className="text-[1.5rem]">
                  Ideas
                </h2>
                {toPractice > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => startSession('guided_review')}
                      disabled={starting !== null}
                      title="About 15 minutes: an explanation from your material, then practice"
                    >
                      {starting === 'guided_review' ? (
                        <>
                          <span className="spinner" /> Writing the review
                        </>
                      ) : (
                        'Guided Review'
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => startSession('quick_check')}
                      disabled={starting !== null}
                      title="4 to 6 questions on your own"
                    >
                      {starting === 'quick_check' ? (
                        <>
                          <span className="spinner" /> Writing questions
                        </>
                      ) : (
                        'Quick Check'
                      )}
                    </button>
                  </div>
                )}
              </div>
              {toPractice > 0 && (
                <p className="mt-2 text-[0.9rem] text-ink-soft">
                  A Quick Check is 4 to 6 questions on your own. A Guided Review takes about 15 minutes: an explanation
                  from your material first, then practice.
                </p>
              )}
              {ideas.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {ideas.map((idea) => (
                    <li key={idea.id} className="panel p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-[1.15rem]">{idea.name}</span>
                        <StateChip state={idea.state} label={idea.label} />
                      </div>
                      <p className="mt-1 text-[0.92rem] text-ink-soft">
                        {idea.next ? `${idea.reason} ${idea.next}` : idea.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="panel mt-4 p-6">
                  <p className="max-w-[52ch] text-ink-soft">
                    Add the slides or notes from a class. Lyceo finds the ideas in them and checks what you can do.
                  </p>
                  <Link href={uploadHref} className="btn btn-primary mt-4 no-underline">
                    Add material
                  </Link>
                </div>
              )}
              {materials.length > 0 && (
                <>
                  <h3 className="mt-8 text-[1.2rem]">Materials</h3>
                  <ul className="mt-2 divide-y divide-line border-y border-line">
                    {materials.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                        <Link href={`/materials/${m.id}`} className="text-ink underline-offset-4 hover:underline">
                          {m.title}
                        </Link>
                        <span className="text-[0.85rem] text-ink-soft">
                          {m.status === 'mapped'
                            ? `${m.ideas} ${m.ideas === 1 ? 'idea' : 'ideas'}`
                            : m.status === 'failed'
                              ? 'Couldn’t be used'
                              : 'Being read'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {(!loop || lessons.length > 0) && (
            <section aria-labelledby="lessons-title" className="order-3">
              <h2 id="lessons-title" className="text-[1.5rem]">
                Lessons
              </h2>
              {lessons.length > 0 ? (
                <div className="mt-3">
                  <LessonRows lessons={lessons} courses={detail.courses} onMoved={load} />
                </div>
              ) : (
                <div className="panel mt-4 p-6">
                  <p className="max-w-[52ch] text-ink-soft">
                    No lessons in this course yet. Upload slides or a recording from one class and Theo will turn it
                    into a lesson.
                  </p>
                  {!detail.plan.some((a) => a.kind === 'add-material') && (
                    <Link href={uploadHref} className="btn btn-primary mt-4 no-underline">
                      Add material
                    </Link>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="contents lg:block lg:min-w-0 lg:space-y-10">
          <div className="order-2">
            <Deadlines deadlines={detail.deadlines} courses={detail.courses} courseId={course.id} onChange={load} />
          </div>

          <section aria-labelledby="progress-title" className="panel order-4 p-5 sm:p-6">
            <h2 id="progress-title" className="text-[1.3rem]">
              Progress
            </h2>
            {course.conceptsChecked > 0 ? (
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-[0.82rem] text-ink-soft">Right on the first try</dt>
                  <dd className="font-display text-[1.6rem] leading-tight text-moss">
                    {course.firstTryCorrect} of {course.conceptsChecked}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.82rem] text-ink-soft">To review</dt>
                  <dd className="font-display text-[1.6rem] leading-tight">{course.toReview}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-[0.92rem] text-ink-soft">
                Progress shows up after your first check-ins in this course’s lessons.
              </p>
            )}
            {course.lessons > 0 && (
              <p className="mt-4 text-[0.86rem] text-ink-soft">{plural(course.lessons, 'lesson')} in this course.</p>
            )}
          </section>

          <div className="order-5 text-[0.88rem]">
            {confirmDelete ? (
              <p className="text-ink-soft">
                {loop
                  ? `Delete ${course.name} with its deadlines, materials, ideas and Quick Check answers? Its lessons stay in My Academy.`
                  : `Delete ${course.name} and its deadlines? Its lessons stay in My Academy.`}{' '}
                <button
                  type="button"
                  className="text-terracotta underline underline-offset-4"
                  onClick={remove}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting' : 'Delete course'}
                </button>{' '}
                <button
                  type="button"
                  className="text-ink-soft underline underline-offset-4"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep it
                </button>
              </p>
            ) : (
              <button
                type="button"
                className="text-ink-soft underline underline-offset-4"
                onClick={() => setConfirmDelete(true)}
              >
                Delete this course
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
