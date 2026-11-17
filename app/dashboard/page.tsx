'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AppShell, LoadingNote, useRequiredUser } from '../components/AppShell'
import { Theo } from '../components/Theo'
import { normalizeLesson, type LearnerSummary } from '../lib/lesson'
import { getStyle } from '../lib/learning-styles'
import { getJSON, postJSON, supabase } from '../lib/supabase'

type CourseRow = {
  id: number
  title: string | null
  status: string | null
  created_at: string
  script: unknown
}

const PACE_LABEL: Record<LearnerSummary['pace'], string> = {
  gentle: 'Smaller steps',
  steady: 'Steady',
  brisk: 'Brisk',
}

const STYLE_SHORT: Record<string, string> = {
  analogias: 'Analogy',
  formal: 'Structure',
  codigo: 'Code',
  visual: 'Diagrams',
}

export default function Dashboard() {
  const user = useRequiredUser()
  const router = useRouter()
  const [courses, setCourses] = useState<CourseRow[] | null>(null)
  const [learner, setLearner] = useState<LearnerSummary | null>(null)
  const [reviewing, setReviewing] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const loadLearner = async () => {
      await supabase.from('users').upsert({ id: user.id, email: user.email, name: user.user_metadata?.full_name })
      setLearner(await getJSON<LearnerSummary>('/api/learner'))
    }
    loadLearner().catch(() => setLearner(null))

    supabase
      .from('courses')
      .select('id, title, status, created_at, script')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCourses((data ?? []) as CourseRow[]))
  }, [user])

  const review = async (courseId: number) => {
    setReviewing(courseId)
    setError(null)
    try {
      const { courseId: id } = await postJSON<{ courseId: number }>('/api/review', { courseId })
      router.push(`/class/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the review.')
      setReviewing(null)
    }
  }

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]

  if (!user || courses === null) {
    return (
      <AppShell>
        <LoadingNote>Loading your lessons</LoadingNote>
      </AppShell>
    )
  }

  if (courses.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl pt-6 text-center">
          <Theo size={140} className="mx-auto" />
          <h1 className="mt-8 text-[clamp(1.8rem,3.6vw,2.5rem)]">
            {firstName ? `Welcome, ${firstName}.` : 'Welcome.'} Your first lesson starts with your notes.
          </h1>
          <p className="mt-4 text-ink-soft">
            Upload the slides or a recording from a class you want to understand better. Theo turns it into a lesson in
            about a minute.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/upload" className="btn btn-primary px-6 py-3 no-underline">
              Make my first lesson
            </Link>
            <Link href="/demo" className="btn btn-quiet px-6 py-3 no-underline">
              See a demo lesson first
            </Link>
          </div>
          {!learner?.styleId && (
            <p className="mt-8 text-ink-soft">
              Before you start,{' '}
              <Link href="/profile" className="text-forest underline underline-offset-4">
                tell Theo how you like to learn
              </Link>
              .
            </p>
          )}
        </div>
      </AppShell>
    )
  }

  const reviewByCourse = new Map<number, { title: string; concepts: string[] }>()
  for (const r of learner?.needsReview ?? []) {
    const entry = reviewByCourse.get(r.courseId) ?? { title: r.courseTitle, concepts: [] }
    entry.concepts.push(r.concept)
    reviewByCourse.set(r.courseId, entry)
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[clamp(1.9rem,3.6vw,2.6rem)]">{firstName ? `Hi, ${firstName}` : 'Your lessons'}</h1>
        <Link href="/upload" className="btn btn-primary no-underline">
          New lesson
        </Link>
      </div>

      {!learner?.styleId && (
        <p className="mt-6 rounded-lg border-l-4 border-gold bg-ivory-deep px-4 py-3">
          Theo doesn&apos;t know how you like to learn yet.{' '}
          <Link href="/profile" className="font-bold text-forest underline underline-offset-4">
            Set your learning style
          </Link>{' '}
          and your next lesson will be written for it.
        </p>
      )}

      {learner && learner.conceptsSeen > 0 && (
        <section className="panel mt-8 p-6 sm:p-8" aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="text-[1.45rem]">
            How you learn, so far
          </h2>
          <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat
              label="Right on the first try"
              value={learner.firstTryAccuracy === null ? '–' : `${Math.round(learner.firstTryAccuracy * 100)}%`}
              tone="text-moss"
            />
            <Stat label="Ideas checked" value={String(learner.conceptsSeen)} />
            <Stat label="Pace" value={PACE_LABEL[learner.pace]} />
            <Stat label="Learns by" value={learner.styleId ? (STYLE_SHORT[learner.styleId] ?? 'Mixed') : 'Not set'} />
          </dl>

          {reviewByCourse.size > 0 ? (
            <div className="mt-7 border-t border-line pt-6">
              <h3 className="font-sans text-[1.05rem] font-bold">Worth reviewing</h3>
              <ul className="mt-3 space-y-3">
                {[...reviewByCourse.entries()].map(([courseId, { title, concepts }]) => (
                  <li key={courseId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ivory px-4 py-3">
                    <div>
                      <p className="font-medium">{concepts.join(', ')}</p>
                      <p className="text-[0.92rem] text-ink-soft">From {title}</p>
                    </div>
                    <button className="btn btn-quiet py-2" onClick={() => review(courseId)} disabled={reviewing !== null}>
                      {reviewing === courseId ? (
                        <>
                          <span className="spinner" /> Writing review
                        </>
                      ) : (
                        'Make a review lesson'
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {error && <p className="mt-3 text-terracotta">{error}</p>}
            </div>
          ) : (
            <p className="mt-6 border-t border-line pt-5 text-ink-soft">
              Nothing to review: you got every check-in right on the first try.
            </p>
          )}
          <p className="mt-6 text-[0.92rem] text-ink-soft">
            Theo uses this when he writes your next lesson
            {getStyle(learner.styleId) ? `, along with your preference for ${getStyle(learner.styleId)!.label.toLowerCase()}` : ''}.
          </p>
        </section>
      )}

      <section className="mt-10" aria-labelledby="lessons-heading">
        <h2 id="lessons-heading" className="text-[1.45rem]">
          Your lessons
        </h2>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {courses.map((c) => {
            const lesson = normalizeLesson(c.script)
            const title = lesson?.title || c.title || 'Untitled lesson'
            const isReview = lesson?.meta?.kind === 'review'
            const date = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <li key={c.id}>
                {lesson ? (
                  <Link
                    href={`/class/${c.id}`}
                    className="group flex items-center justify-between gap-4 py-4 no-underline"
                  >
                    <div>
                      <p className="font-display text-[1.15rem] font-semibold group-hover:text-forest">{title}</p>
                      <p className="mt-0.5 text-[0.92rem] text-ink-soft">
                        {isReview ? 'Review lesson, ' : ''}
                        {lesson.segments.length} {lesson.segments.length === 1 ? 'part' : 'parts'}, about {lesson.estimatedMinutes} min. Made {date}.
                      </p>
                    </div>
                    <span className="text-forest opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">
                      Open
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <p className="font-display text-[1.15rem] font-semibold text-ink-soft">{title}</p>
                      <p className="mt-0.5 text-[0.92rem] text-terracotta">
                        Theo didn&apos;t finish this one. Upload the material again to retry.
                      </p>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </AppShell>
  )
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[0.9rem] text-ink-soft">{label}</dt>
      <dd className={`font-display text-[1.75rem] font-semibold leading-tight ${tone}`}>{value}</dd>
    </div>
  )
}
