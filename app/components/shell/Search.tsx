'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SearchIcon } from '../learn/icons'
import { useAcademy } from './academy'
import { assignmentHref, lectureHref } from './Sidebar'

// Search across the student's academy: its places, courses, lectures, assignments, readings and ideas. Everything
// searched is the student's own data, already loaded for the navigation (the rest loads when search opens).

type Entry = { kind: string; label: string; context?: string; href: string }

const PLACES: Entry[] = [
  { kind: 'Page', label: 'My Academy', href: '/dashboard' },
  { kind: 'Page', label: 'Study Plan', href: '/study-plan' },
  { kind: 'Page', label: 'Global Progress', href: '/progress' },
  { kind: 'Page', label: 'Add material', href: '/materials/new' },
  { kind: 'Page', label: 'The Lyceum', href: '/lyceum' },
  { kind: 'Page', label: 'Profile', href: '/profile' },
]

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const academy = useAcademy()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const loadAll = academy?.loadAll

  useEffect(() => {
    loadAll?.()
  }, [loadAll])

  const entries = useMemo(() => {
    const all: Entry[] = [...PLACES]
    for (const course of academy?.courses ?? []) {
      const name = course.code ? `${course.code}, ${course.name}` : course.name
      all.push({ kind: 'Course', label: name, href: `/courses/${course.id}` })
      for (const [part, path] of [
        ['Lectures', 'lectures'],
        ['Assignments', 'assignments'],
        ['Materials', 'materials'],
        ['Knowledge Map', 'knowledge-map'],
      ])
        all.push({
          kind: 'Course',
          label: `${course.code || course.name} ${part}`,
          href: `/courses/${course.id}/${path}`,
        })
      const detail = academy?.details[course.id]
      const materials = detail?.lectures ?? []
      const short = course.code || course.name
      materials
        .filter((m) => m.role === 'lecture')
        .forEach((m, i) =>
          all.push({
            kind: 'Lecture',
            label: `Lecture ${i + 1}: ${m.title}`,
            context: short,
            href: lectureHref(course.id, m),
          }),
        )
      for (const m of materials.filter((m) => m.role === 'assignment'))
        all.push({ kind: 'Assignment', label: m.title, context: short, href: assignmentHref(course.id, m) })
      for (const m of materials.filter((m) => m.role === 'reading' || m.role === 'other'))
        all.push({ kind: 'Material', label: m.title, context: short, href: lectureHref(course.id, m) })
      for (const idea of detail?.ideas ?? [])
        all.push({
          kind: 'Idea',
          label: idea.name,
          context: `${short}, ${idea.label}`,
          href: `/courses/${course.id}/knowledge-map`,
        })
    }
    return all
  }, [academy?.courses, academy?.details])

  const results = useMemo(() => {
    const q = normalize(query.trim())
    if (!q)
      return entries.filter(
        (e) =>
          e.kind === 'Page' ||
          (e.kind === 'Course' && !/ (Lectures|Assignments|Materials|Knowledge Map)$/.test(e.label)),
      )
    const words = q.split(/\s+/)
    return entries.filter((e) => {
      const text = normalize(`${e.label} ${e.context ?? ''} ${e.kind}`)
      return words.every((w) => text.includes(w))
    })
  }, [entries, query])
  const shown = results.slice(0, 40)
  const active = Math.min(selected, Math.max(0, shown.length - 1))

  const go = (entry: Entry | undefined) => {
    if (!entry) return
    onClose()
    router.push(entry.href)
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 px-6 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Lyceo"
        className="w-full max-w-xl overflow-hidden rounded-[20px] border border-[#e6dac6] bg-[#fbf6ee] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[#ebdfcd] px-5">
          <span className="text-ink-soft">
            <SearchIcon size={20} />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((i) => Math.min(i + 1, shown.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                go(shown[active])
              } else if (e.key === 'Escape') onClose()
            }}
            placeholder="Search courses, lectures, assignments and ideas"
            aria-label="Search"
            aria-controls="search-results"
            aria-activedescendant={shown.length ? `search-${active}` : undefined}
            className="h-14 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-[#7a776c]"
          />
          <kbd className="rounded-md border border-[#e0d3bd] px-1.5 py-0.5 text-[0.72rem] text-ink-soft">Esc</kbd>
        </div>
        <ul id="search-results" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
          {shown.length === 0 ? (
            <li className="px-5 py-6 text-center text-[0.92rem] text-ink-soft">Nothing matches “{query}”.</li>
          ) : (
            shown.map((entry, i) => (
              <li
                key={`${entry.href}-${entry.label}`}
                id={`search-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setSelected(i)}
                onClick={() => go(entry)}
                className={`flex cursor-pointer items-baseline justify-between gap-4 px-5 py-2.5 ${
                  i === active ? 'bg-[#efe3cf]' : ''
                }`}
              >
                <span className="min-w-0 truncate text-[0.95rem] text-[#1d1c19]">{entry.label}</span>
                <span className="shrink-0 text-[0.78rem] text-ink-soft">
                  {entry.context ? `${entry.kind}, ${entry.context}` : entry.kind}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
