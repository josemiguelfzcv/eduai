'use client'

import type { User } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AcademyCourse, CourseDetail } from '../../lib/academy'
import { clockQuery } from '../../lib/clock'
import { getJSON } from '../../lib/supabase'
import { useRequiredUser } from '../AppShell'

// The student's academy as the shell knows it: their courses (for the sidebar) and the details of each course opened
// so far (its lectures, assignments, ideas), loaded once and shared by every page. Pages call reload after they
// change something the navigation shows.

type Academy = {
  user: User | null
  courses: AcademyCourse[] | null
  details: Record<number, CourseDetail | undefined>
  /** Loads a course's details (once, unless `fresh`). */
  loadCourse: (id: number, fresh?: boolean) => Promise<void>
  /** Loads every course's details, for search and the progress pages. */
  loadAll: () => Promise<void>
  reloadCourses: () => Promise<void>
}

const AcademyContext = createContext<Academy | null>(null)
export const useAcademy = () => useContext(AcademyContext)

export function AcademyProvider({ children }: { children: React.ReactNode }) {
  const user = useRequiredUser()
  const [courses, setCourses] = useState<AcademyCourse[] | null>(null)
  const [details, setDetails] = useState<Record<number, CourseDetail | undefined>>({})
  const loading = useRef(new Map<number, Promise<void>>())
  const loaded = useRef(new Set<number>())
  const coursesRef = useRef<AcademyCourse[] | null>(null)

  const reloadCourses = useCallback(
    () =>
      getJSON<{ courses: AcademyCourse[] }>('/api/academy/courses').then(
        ({ courses: list }) => {
          coursesRef.current = list
          setCourses(list)
        },
        () => setCourses((c) => c ?? []),
      ),
    [],
  )

  const loadCourse = useCallback((id: number, fresh = false) => {
    if (!fresh && loaded.current.has(id)) return Promise.resolve()
    const pending = loading.current.get(id)
    if (pending && !fresh) return pending
    const request = getJSON<CourseDetail>(`/api/academy/courses/${id}?${clockQuery()}`)
      .then(
        (detail) => {
          loaded.current.add(id)
          setDetails((all) => ({ ...all, [id]: detail }))
        },
        () => {
          // The page shows what went wrong; the navigation keeps what it had.
        },
      )
      .finally(() => loading.current.delete(id))
    loading.current.set(id, request)
    return request
  }, [])

  const loadAll = useCallback(async () => {
    await Promise.all((coursesRef.current ?? []).map((c) => loadCourse(c.id)))
  }, [loadCourse])

  useEffect(() => {
    if (user) reloadCourses()
  }, [user, reloadCourses])

  const value = useMemo(
    () => ({ user, courses, details, loadCourse, loadAll, reloadCourses }),
    [user, courses, details, loadCourse, loadAll, reloadCourses],
  )
  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>
}

/**
 * The course of the page being shown (from its /courses/[id] address), loaded through the shared academy. Null
 * outside the learning environment.
 */
export function useCourseWorkspace() {
  const academy = useAcademy()
  const params = useParams<{ id?: string }>()
  const id = Number(params?.id)
  const valid = Number.isSafeInteger(id)
  const loadCourse = academy?.loadCourse
  useEffect(() => {
    if (loadCourse && valid) loadCourse(id)
  }, [loadCourse, id, valid])
  const reload = useCallback(
    () => (loadCourse && valid ? loadCourse(id, true) : Promise.resolve()),
    [loadCourse, id, valid],
  )
  if (!academy || !valid) return null
  return { detail: academy.details[id] ?? null, reload }
}
