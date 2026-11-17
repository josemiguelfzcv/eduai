'use client'

import { useState } from 'react'
import { currentTerm, type AcademyCourse } from '../../lib/academy'
import { patchJSON, postJSON } from '../../lib/supabase'

/** Creates a course, or edits one when `course` is given. */
export function CourseForm({
  course,
  onSaved,
  onCancel,
}: {
  course?: AcademyCourse
  onSaved: (course: AcademyCourse) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(course?.name ?? '')
  const [code, setCode] = useState(course?.code ?? '')
  const [term, setTerm] = useState(course?.term ?? currentTerm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { name, code, term }
      const { course: saved } = course
        ? await patchJSON<{ course: AcademyCourse }>(`/api/academy/courses/${course.id}`, body)
        : await postJSON<{ course: AcademyCourse }>('/api/academy/courses', body)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the course.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="panel space-y-4 p-5">
      <div>
        <label htmlFor="course-name" className="mb-1.5 block text-[0.88rem] font-semibold">
          Course name
        </label>
        <input
          id="course-name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Introduction to Statistics"
          maxLength={120}
          required
          autoFocus
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="course-code" className="mb-1.5 block text-[0.88rem] font-semibold">
            Code <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            id="course-code"
            className="field"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="STAT 161"
            maxLength={30}
          />
        </div>
        <div>
          <label htmlFor="course-term" className="mb-1.5 block text-[0.88rem] font-semibold">
            Term
          </label>
          <input
            id="course-term"
            className="field"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            maxLength={40}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[0.92rem] text-terracotta">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Saving' : course ? 'Save course' : 'Add course'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
