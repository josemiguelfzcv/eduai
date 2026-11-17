'use client'

import Link from 'next/link'
import { useState } from 'react'
import { pendingReview, type AcademyCourse, type LessonProgress } from '../../lib/academy'
import { patchJSON } from '../../lib/supabase'
import { lessonHref, lessonStatus } from './format'

/** Lessons with their progress, and a picker to file each one under a course. */
export function LessonRows({
  lessons,
  courses,
  onMoved,
}: {
  lessons: LessonProgress[]
  courses: AcademyCourse[]
  onMoved: () => void
}) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {lessons.map((l) => (
        <LessonRow key={l.id} lesson={l} all={lessons} courses={courses} onMoved={onMoved} />
      ))}
    </ul>
  )
}

function LessonRow({
  lesson: l,
  all,
  courses,
  onMoved,
}: {
  lesson: LessonProgress
  all: LessonProgress[]
  courses: AcademyCourse[]
  onMoved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toReview = pendingReview(l, all)

  const move = async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      await patchJSON(`/api/academy/lessons/${l.id}`, { courseId: value === '' ? null : Number(value) })
      onMoved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move the lesson.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link href={lessonHref(l)} className="font-display text-[1.15rem] leading-snug no-underline hover:text-forest">
          {l.title}
        </Link>
        <p className="mt-0.5 text-[0.86rem] text-ink-soft">
          {l.kind === 'review' ? 'Review lesson. ' : ''}
          {lessonStatus(l)}
          {toReview.length > 0 && <span className="text-terracotta">. {toReview.length} to review</span>}
        </p>
        {error && <p className="mt-1 text-[0.85rem] text-terracotta">{error}</p>}
      </div>
      {courses.length > 0 && (
        <label className="flex shrink-0 items-center gap-2 text-[0.84rem] text-ink-soft">
          <span className="sr-only">Course for {l.title}</span>
          <select
            className="field w-auto py-1.5 text-[0.86rem]"
            value={l.courseId ?? ''}
            disabled={busy}
            onChange={(e) => move(e.target.value)}
          >
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </li>
  )
}
