'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AppShell, LoadingNote, useRequiredUser } from '../components/AppShell'
import { CourseCard } from '../components/academy/CourseCard'
import { CourseForm } from '../components/academy/CourseForm'
import { Deadlines } from '../components/academy/Deadlines'
import { plural } from '../components/academy/format'
import { LearningProfile } from '../components/academy/LearningProfile'
import { LessonRows } from '../components/academy/LessonRows'
import { SetupNotice } from '../components/academy/SetupNotice'
import { TodayPlan } from '../components/academy/TodayPlan'
import { whenLabel, type AcademySnapshot } from '../lib/academy'
import { clockQuery } from '../lib/clock'
import { Closure } from '../components/study/Closure'
import { ApiError, getJSON, supabase } from '../lib/supabase'

type Problem = { setup: boolean; message: string }

/** My Academy: what to study today and why, what's due, and how each course is going. */
export default function MyAcademy() {
  const user = useRequiredUser()
  const [snap, setSnap] = useState<AcademySnapshot | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [addingCourse, setAddingCourse] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await getJSON<AcademySnapshot>(`/api/academy?${clockQuery()}`)
      setSnap(data)
      setProblem(null)
    } catch (e) {
      setProblem({
        setup: e instanceof ApiError && e.status === 503,
        message: e instanceof Error ? e.message : 'Could not load My Academy.',
      })
    }
  }, [])

  useEffect(() => {
    if (!user) return
    supabase
      .from('users')
      .upsert({ id: user.id, email: user.email, name: user.user_metadata?.full_name })
      .then(() => load())
  }, [user, load])

  if (!snap) {
    return (
      <AppShell wide>
        {problem ? (
          problem.setup ? (
            <SetupNotice />
          ) : (
            <div role="alert" className="panel p-6">
              <p>{problem.message}</p>
              <button type="button" className="btn btn-quiet mt-4" onClick={load}>
                Try again
              </button>
            </div>
          )
        ) : (
          <LoadingNote>Opening My Academy</LoadingNote>
        )}
      </AppShell>
    )
  }

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const minutes = snap.plan.reduce((n, a) => n + a.minutes, 0)
  const next = snap.deadlines.find((d) => d.daysLeft >= 0)
  const isNew = snap.courses.length === 0 && snap.unsorted.length === 0
  const uploadHref = snap.learningLoop ? '/materials/new' : '/upload'
  const uploadLabel = snap.learningLoop ? 'Add material' : 'New lesson'
  const last = snap.sinceLastTime

  return (
    <AppShell wide>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-[0.95rem] text-ink-soft">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="mt-1 text-[clamp(2.1rem,4vw,3rem)]">
            {greeting}
            {firstName ? `, ${firstName}` : ''}.
          </h1>
          {!isNew && (
            <p className="mt-2 text-ink-soft">
              {snap.plan.length
                ? `${plural(snap.plan.length, 'step')} for today, about ${minutes} minutes.`
                : 'Nothing urgent today.'}
              {next && ` Next up: ${next.title} for ${next.courseName}, ${whenLabel(next.daysLeft)}.`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-quiet" onClick={() => setAddingCourse(true)}>
            Add course
          </button>
          <Link href={uploadHref} className="btn btn-primary no-underline">
            {uploadLabel}
          </Link>
        </div>
      </header>

      {addingCourse && (
        <div className="mt-6 max-w-xl">
          <CourseForm
            onCancel={() => setAddingCourse(false)}
            onSaved={() => {
              setAddingCourse(false)
              load()
            }}
          />
        </div>
      )}

      {/* One column on phones, ordered today, upcoming, courses, unfiled, profile; two columns from lg. */}
      <div className="mt-10 flex flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
        <div className="contents lg:block lg:min-w-0 lg:space-y-14">
          {last && (
            <section aria-labelledby="last-title" className="order-1">
              <h2 id="last-title" className="text-[1.5rem]">
                Since last time
              </h2>
              <div className="panel mt-4 p-5 sm:p-6">
                <p className="text-[0.88rem] text-ink-soft">
                  Quick Check{last.courseName ? ` · ${last.courseName}` : ''} ·{' '}
                  {new Date(last.lastActiveAt).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                <div className="mt-2">
                  <Closure summary={last.summary} compact />
                </div>
                <Link
                  href={`/sessions/${last.sessionId}`}
                  className="mt-3 inline-block text-forest underline underline-offset-4"
                >
                  {last.status === 'active' ? 'Pick up where you stopped' : 'See the whole closure'}
                </Link>
              </div>
            </section>
          )}

          <section aria-labelledby="today-title" className="order-1">
            <h2 id="today-title" className="text-[1.8rem]">
              What to study today
            </h2>
            <div className="mt-5">
              {snap.plan.length > 0 ? (
                <TodayPlan plan={snap.plan} />
              ) : isNew ? (
                <Welcome onAddCourse={() => setAddingCourse(true)} />
              ) : (
                <div className="panel p-6">
                  <p className="font-display text-[1.3rem]">You’re caught up.</p>
                  <p className="mt-1 max-w-[52ch] text-ink-soft">
                    {next
                      ? `${next.title} for ${next.courseName} is ${whenLabel(next.daysLeft)}. Upload the material it covers and Theo will turn it into a lesson.`
                      : 'Upload slides from your next class, or add an upcoming exam, and Theo will plan around it.'}
                  </p>
                  <Link href={uploadHref} className="btn btn-quiet mt-4 no-underline">
                    {uploadLabel}
                  </Link>
                </div>
              )}
            </div>
          </section>

          {!isNew && (
            <section aria-labelledby="courses-title" className="order-3">
              <h2 id="courses-title" className="text-[1.5rem]">
                Courses
              </h2>
              {snap.courses.length > 0 ? (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                  {snap.courses.map((c) => (
                    <li key={c.id}>
                      <CourseCard course={c} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 max-w-[56ch] text-ink-soft">
                  Add the courses you’re taking this term to group your lessons and plan around their exams.{' '}
                  <button
                    type="button"
                    className="text-forest underline underline-offset-4"
                    onClick={() => setAddingCourse(true)}
                  >
                    Add a course
                  </button>
                </p>
              )}
            </section>
          )}

          {snap.unsorted.length > 0 && (
            <section aria-labelledby="unsorted-title" className="order-4">
              <h2 id="unsorted-title" className="text-[1.5rem]">
                Not in a course yet
              </h2>
              <p className="mt-1 text-[0.92rem] text-ink-soft">
                {snap.courses.length
                  ? 'Choose a course for each lesson so its exams and progress line up.'
                  : 'Once you add a course, you can move these lessons into it.'}
              </p>
              <div className="mt-3">
                <LessonRows lessons={snap.unsorted} courses={snap.courses} onMoved={load} />
              </div>
            </section>
          )}
        </div>

        <div className="contents lg:block lg:min-w-0 lg:space-y-10">
          <div className="order-2">
            <Deadlines deadlines={snap.deadlines} courses={snap.courses} onChange={load} />
          </div>
          <div className="order-5">
            <LearningProfile learner={snap.learner} />
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function Welcome({ onAddCourse }: { onAddCourse: () => void }) {
  const steps = [
    { title: 'Add your courses', body: 'The classes you’re taking this term.' },
    { title: 'Upload material', body: 'Slides or a recording from one class. Theo turns it into a lesson.' },
    { title: 'Add your next exam', body: 'Theo uses the date to decide what to study first.' },
  ]
  return (
    <div className="panel p-6 sm:p-8">
      <p className="font-display text-[1.5rem]">Set up your academy</p>
      <ol className="mt-5 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="font-display text-[1.4rem] leading-none text-gold-deep" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="text-[0.92rem] text-ink-soft">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={onAddCourse}>
          Add your first course
        </button>
        <Link href="/demo" className="btn btn-quiet no-underline">
          Try a 5-minute lesson
        </Link>
      </div>
    </div>
  )
}
