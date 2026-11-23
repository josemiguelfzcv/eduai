'use client'

import { useState } from 'react'
import {
  DEADLINE_KINDS,
  localToday,
  type AcademyCourse,
  type DatedDeadline,
  type DeadlineKind,
} from '../../lib/academy'
import { deleteJSON, patchJSON, postJSON } from '../../lib/supabase'
import { dateParts, dueLabel, kindLabel } from './format'

/** Upcoming exams, quizzes and assignments, with a form to add one. */
export function Deadlines({
  deadlines,
  courses,
  courseId,
  onChange,
  heading = true,
}: {
  deadlines: DatedDeadline[]
  courses: AcademyCourse[]
  /** When set, the list belongs to one course and new deadlines go there. */
  courseId?: number
  onChange: () => void
  /** False inside a card that already names the list. */
  heading?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const upcoming = deadlines.filter((d) => !d.completedAt)
  const done = deadlines.filter((d) => d.completedAt)

  return (
    <section aria-labelledby={heading ? 'deadlines-title' : undefined} aria-label={heading ? undefined : 'Deadlines'}>
      <div className={`flex items-center gap-3 ${heading ? 'justify-between' : 'justify-end'}`}>
        {heading && (
          <h2 id="deadlines-title" className="text-[1.5rem]">
            Upcoming
          </h2>
        )}
        {!adding && courses.length > 0 && (
          <button type="button" className="btn btn-quiet px-4 py-2 text-[0.85rem]" onClick={() => setAdding(true)}>
            Add deadline
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-4">
          <DeadlineForm
            courses={courses}
            courseId={courseId}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false)
              onChange()
            }}
          />
        </div>
      )}

      {courses.length === 0 ? (
        <p className="mt-3 text-[0.92rem] text-ink-soft">Add a course first, then its exams and assignments.</p>
      ) : upcoming.length === 0 && !adding ? (
        <p className="mt-3 text-[0.92rem] text-ink-soft">
          No deadlines yet. Add your next exam or assignment so Theo can plan around it.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {upcoming.map((d) => (
            <DeadlineRow key={d.id} deadline={d} showCourse={courseId === undefined} onChange={onChange} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[0.88rem] text-ink-soft">{done.length} done</summary>
          <ul className="mt-1 divide-y divide-line opacity-75">
            {done.map((d) => (
              <DeadlineRow key={d.id} deadline={d} showCourse={courseId === undefined} onChange={onChange} />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function DeadlineRow({
  deadline: d,
  showCourse,
  onChange,
}: {
  deadline: DatedDeadline
  showCourse: boolean
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { month, day } = dateParts(d.dueOn)
  const due = dueLabel(d)

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await work()
      onChange()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <li className="flex items-start gap-4 py-4">
      <div className="w-12 shrink-0 rounded-lg border border-line bg-panel py-1.5 text-center" aria-hidden="true">
        <div className="text-[0.68rem] font-semibold text-ink-soft">{month}</div>
        <div className="font-display text-[1.35rem] leading-none">{day}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{d.title}</p>
        <p className="mt-0.5 text-[0.84rem] text-ink-soft">
          {kindLabel(d.kind)}
          {showCourse ? `, ${d.courseName}` : ''}
        </p>
        {d.topics && <p className="mt-1 text-[0.84rem] text-ink-soft">Covers {d.topics}</p>}
        <div className="mt-2 flex flex-wrap gap-3 text-[0.82rem]">
          <button
            type="button"
            disabled={busy}
            className="text-ink-soft underline decoration-stone underline-offset-4 hover:text-ink"
            onClick={() => run(() => patchJSON(`/api/academy/deadlines/${d.id}`, { completed: !d.completedAt }))}
          >
            {d.completedAt ? 'Mark not done' : 'Mark done'}
          </button>
          {confirming ? (
            <button
              type="button"
              disabled={busy}
              className="text-terracotta underline underline-offset-4"
              onClick={() => run(() => deleteJSON(`/api/academy/deadlines/${d.id}`))}
            >
              Confirm remove
            </button>
          ) : (
            <button
              type="button"
              className="text-ink-soft underline decoration-stone underline-offset-4 hover:text-ink"
              onClick={() => setConfirming(true)}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.78rem] font-semibold ${due.tone}`}>
        {due.text}
      </span>
    </li>
  )
}

function DeadlineForm({
  courses,
  courseId,
  onSaved,
  onCancel,
}: {
  courses: AcademyCourse[]
  courseId?: number
  onSaved: () => void
  onCancel: () => void
}) {
  const [course, setCourse] = useState<number>(courseId ?? courses[0]?.id)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<DeadlineKind>('exam')
  const [dueOn, setDueOn] = useState('')
  const [topics, setTopics] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await postJSON('/api/academy/deadlines', { courseId: course, title, kind, dueOn, topics })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the deadline.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="panel space-y-4 p-5">
      {courseId === undefined && (
        <div>
          <label htmlFor="deadline-course" className="mb-1.5 block text-[0.88rem] font-semibold">
            Course
          </label>
          <select
            id="deadline-course"
            className="field"
            value={course}
            onChange={(e) => setCourse(Number(e.target.value))}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="deadline-title" className="mb-1.5 block text-[0.88rem] font-semibold">
          What’s due
        </label>
        <input
          id="deadline-title"
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Midterm 2"
          maxLength={120}
          required
          autoFocus
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="deadline-kind" className="mb-1.5 block text-[0.88rem] font-semibold">
            Type
          </label>
          <select
            id="deadline-kind"
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value as DeadlineKind)}
          >
            {DEADLINE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="deadline-date" className="mb-1.5 block text-[0.88rem] font-semibold">
            Date
          </label>
          <input
            id="deadline-date"
            type="date"
            className="field"
            value={dueOn}
            min={localToday()}
            onChange={(e) => setDueOn(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <label htmlFor="deadline-topics" className="mb-1.5 block text-[0.88rem] font-semibold">
          What it covers <span className="font-normal text-ink-soft">(optional)</span>
        </label>
        <input
          id="deadline-topics"
          className="field"
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
          placeholder="Chapters 5 to 7, sampling distributions"
          maxLength={500}
        />
      </div>
      {error && (
        <p role="alert" className="text-[0.92rem] text-terracotta">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !dueOn}>
          {busy ? 'Adding' : 'Add deadline'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
