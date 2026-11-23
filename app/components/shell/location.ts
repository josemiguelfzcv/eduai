'use client'

import { usePathname } from 'next/navigation'
import { useMemo } from 'react'

// Where the student is, read from the address: which course, which part of it, and which lecture or assignment.

export type Section = 'overview' | 'lectures' | 'assignments' | 'materials' | 'knowledge-map'
const SECTIONS: Section[] = ['overview', 'lectures', 'assignments', 'materials', 'knowledge-map']

export type Location = {
  path: string
  courseId: number | null
  section: Section | null
  /** The lecture or assignment open, if any. */
  itemId: number | null
}

export function parseLocation(path: string): Location {
  const m = /^\/courses\/(\d+)(?:\/([a-z-]+)(?:\/(\d+))?)?\/?$/.exec(path)
  if (!m) return { path, courseId: null, section: null, itemId: null }
  const section = (m[2] ?? 'overview') as Section
  return {
    path,
    courseId: Number(m[1]),
    section: SECTIONS.includes(section) ? section : null,
    itemId: m[3] ? Number(m[3]) : null,
  }
}

export function useLocation() {
  const path = usePathname() ?? ''
  return useMemo(() => parseLocation(path), [path])
}
