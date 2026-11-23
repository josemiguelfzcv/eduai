'use client'

import Link from 'next/link'
import { useState } from 'react'
import { shortDay } from '../../lib/mastery'
import { patchJSON, putJSON } from '../../lib/supabase'
import type { LectureSummary, MaterialRole } from '../../lib/views'
import { ArrowLeftIcon, CheckCircleIcon, PlayCircleIcon } from './icons'

// A course's materials as rows: what each one is, when it was given, and how far the student has read it. Each row
// can be edited in place (title, kind, date) and, for lectures, moved up or down to match the order they were taught.

const ROLE_LABEL: Record<MaterialRole, string> = {
  lecture: 'Lecture',
  assignment: 'Assignment',
  reading: 'Reading',
  other: 'Other',
}

export const materialHref = (courseId: number, m: LectureSummary) =>
  m.status === 'mapped' ? `/courses/${courseId}/lectures/${m.id}` : `/materials/${m.id}`

export function readingStatus(m: LectureSummary) {
  if (m.status !== 'mapped') return 'Lyceo is reading it'
  if (!m.sections) return 'Not started'
  if (m.completed >= m.sections) return 'Read'
  return `${m.completed} of ${m.sections} sections read`
}

export function MaterialRows({
  items,
  courseId,
  numbered = false,
  order,
  onChanged,
  empty,
}: {
  items: LectureSummary[]
  courseId: number
  numbered?: boolean
  /** Every material of the course in its order; given when the rows can be moved. */
  order?: number[]
  onChanged: () => Promise<void> | void
  empty: React.ReactNode
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [moving, setMoving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (!items.length) return <div className="py-2 text-[0.92rem] text-ink-soft">{empty}</div>

  const move = async (id: number, by: -1 | 1) => {
    if (!order) return
    const i = items.findIndex((m) => m.id === id)
    const other = items[i + by]
    if (!other) return
    // Swap the two in the course's full order, so materials of other kinds keep their places.
    const next = [...order]
    const a = next.indexOf(id)
    const b = next.indexOf(other.id)
    ;[next[a], next[b]] = [next[b], next[a]]
    setMoving(true)
    setProblem(null)
    try {
      await putJSON(`/api/academy/courses/${courseId}/order`, { ids: next })
      await onChanged()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not change the order.')
    } finally {
      setMoving(false)
    }
  }

  return (
    <>
      {problem && (
        <p role="alert" className="mb-3 text-[0.9rem] text-terracotta">
          {problem}
        </p>
      )}
      <ol className="divide-y divide-[#efe5d5]">
        {items.map((m, i) => {
          const read = m.sections > 0 && m.completed >= m.sections
          const started = m.completed > 0 && !read
          return (
            <li key={m.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span
                  aria-hidden="true"
                  className={read ? 'text-grove-soft' : started ? 'text-gold-deep' : 'text-[#c9bda7]'}
                >
                  {read ? <CheckCircleIcon size={20} /> : started ? <PlayCircleIcon size={20} /> : <Circle />}
                </span>
                {numbered && <span className="w-5 text-right text-[0.88rem] tabular-nums text-ink-soft">{i + 1}</span>}
                <Link
                  href={materialHref(courseId, m)}
                  className="min-w-0 flex-1 font-display text-[1.05rem] font-medium text-[#1d1c19] no-underline hover:underline hover:underline-offset-4"
                >
                  {m.title}
                </Link>
                <span className="text-[0.84rem] text-ink-soft">
                  {[m.lectureDate ? shortDay(m.lectureDate) : null, readingStatus(m)].filter(Boolean).join(', ')}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(editing === m.id ? null : m.id)}
                  aria-expanded={editing === m.id}
                  className="rounded-full px-3 py-1 text-[0.82rem] font-medium text-grove hover:bg-grove/[0.07]"
                >
                  {editing === m.id ? 'Close' : 'Edit'}
                  <span className="sr-only"> {m.title}</span>
                </button>
              </div>
              {editing === m.id && (
                <EditMaterial
                  material={m}
                  canMoveUp={!!order && i > 0}
                  canMoveDown={!!order && i < items.length - 1}
                  moving={moving}
                  onMove={(by) => move(m.id, by)}
                  onSaved={async () => {
                    await onChanged()
                    setEditing(null)
                  }}
                />
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}

function EditMaterial({
  material,
  canMoveUp,
  canMoveDown,
  moving,
  onMove,
  onSaved,
}: {
  material: LectureSummary
  canMoveUp: boolean
  canMoveDown: boolean
  moving: boolean
  onMove: (by: -1 | 1) => void
  onSaved: () => Promise<void>
}) {
  const [title, setTitle] = useState(material.title)
  const [role, setRole] = useState<MaterialRole>(material.role)
  const [date, setDate] = useState(material.lectureDate ?? '')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const field =
    'mt-1 block w-full rounded-xl border border-[#e2d6c2] bg-[#fffdf9] px-3 py-2 text-[0.92rem] focus:border-grove/50 focus:outline-none'

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setProblem(null)
    try {
      await patchJSON(`/api/materials/${material.id}`, { title, role, lectureDate: date || null })
      await onSaved()
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not save the changes.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-3 rounded-[14px] border border-[#ece1cf] bg-[#fcf6ec] p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="text-[0.82rem] font-medium text-ink-soft">
          Title
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </label>
        <label className="text-[0.82rem] font-medium text-ink-soft">
          What it is
          <select className={field} value={role} onChange={(e) => setRole(e.target.value as MaterialRole)}>
            {(Object.keys(ROLE_LABEL) as MaterialRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[0.82rem] font-medium text-ink-soft">
          Date given
          <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {role === 'assignment' && material.role !== 'assignment' && (
        <p className="mt-2 text-[0.82rem] text-ink-soft">
          As an assignment, Lyceo explains the ideas behind its problems but doesn’t solve them for you.
        </p>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-[0.88rem] text-terracotta">
          {problem}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-grove px-4 py-2 text-[0.85rem] font-semibold text-ivory disabled:opacity-60"
        >
          {saving ? 'Saving' : 'Save'}
        </button>
        {(canMoveUp || canMoveDown) && (
          <span className="ml-auto flex gap-1.5">
            <button
              type="button"
              disabled={!canMoveUp || moving}
              onClick={() => onMove(-1)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dccfb8] px-3 py-1.5 text-[0.82rem] text-grove disabled:opacity-40"
            >
              <span className="rotate-90">
                <ArrowLeftIcon size={15} />
              </span>
              Earlier
            </button>
            <button
              type="button"
              disabled={!canMoveDown || moving}
              onClick={() => onMove(1)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dccfb8] px-3 py-1.5 text-[0.82rem] text-grove disabled:opacity-40"
            >
              <span className="-rotate-90">
                <ArrowLeftIcon size={15} />
              </span>
              Later
            </button>
          </span>
        )}
      </div>
    </form>
  )
}

function Circle() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}
