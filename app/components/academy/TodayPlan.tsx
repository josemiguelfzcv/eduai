'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { StudyAction } from '../../lib/academy'
import { postJSON } from '../../lib/supabase'

const BUTTON: Record<StudyAction['kind'], string> = {
  review: 'Start review',
  'open-review': 'Open review',
  continue: 'Continue',
  start: 'Start lesson',
  'add-material': 'Add material',
  resume: 'Resume',
  confirm: 'Start',
  practice: 'Start',
  'first-check': 'Start',
  'review-skills': 'Start',
}

/** The ordered steps of "What to study today", each with its reason and a button that goes straight to it. */
export function TodayPlan({ plan, showCourse = true }: { plan: StudyAction[]; showCourse?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startReview = async (action: StudyAction) => {
    setBusy(action.key)
    setError(null)
    try {
      const { courseId } = await postJSON<{ courseId: number }>('/api/review', { courseId: action.lessonId })
      router.push(`/class/${courseId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the review.')
      setBusy(null)
    }
  }

  return (
    <>
      <ol className="space-y-3">
        {plan.map((a, i) => {
          const tone = i === 0 ? 'btn-primary' : 'btn-quiet'
          return (
            <li key={a.key} className="panel flex gap-4 p-5 sm:gap-5 sm:p-6">
              <span
                className="w-5 shrink-0 font-display text-[1.7rem] leading-[1.15] text-gold-deep"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[1.28rem] leading-snug">{a.title}</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.82rem] text-ink-soft">
                    {showCourse && a.courseName && (
                      <span className="rounded-full bg-ivory-deep px-2.5 py-0.5 font-medium text-ink">
                        {a.courseName}
                      </span>
                    )}
                    <span>About {a.minutes} min</span>
                  </div>
                  <p className="mt-2 max-w-[60ch] text-[0.95rem] text-ink-soft">{a.why}</p>
                </div>
                {a.href ? (
                  <Link href={a.href} className={`btn ${tone} shrink-0 self-start no-underline sm:self-center`}>
                    {BUTTON[a.kind]}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => startReview(a)}
                    disabled={busy !== null}
                    className={`btn ${tone} shrink-0 self-start sm:self-center`}
                  >
                    {busy === a.key ? (
                      <>
                        <span className="spinner" /> Writing review
                      </>
                    ) : (
                      BUTTON[a.kind]
                    )}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {error && (
        <p role="alert" className="mt-3 text-terracotta">
          {error}
        </p>
      )}
    </>
  )
}
