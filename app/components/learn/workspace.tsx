'use client'

import { useParams } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { CourseDetail } from '../../lib/academy'
import { clockQuery } from '../../lib/clock'
import { getJSON } from '../../lib/supabase'
import { useRequiredUser } from '../AppShell'
import { useFeatures } from '../study/client'
import { CourseRail, CourseSidebar, SidebarPlaceholder } from './CourseSidebar'
import { LearnShell } from './shell'

// A course's learning environment: the course loaded once for every page inside it (overview, lectures, assignments,
// materials, progress), drawn in the shell with its sidebar. Pages read it with useCourseWorkspace() and call
// reload() after they change something the sidebar shows.

type Workspace = { detail: CourseDetail | null; reload: () => Promise<void> }

const WorkspaceContext = createContext<Workspace | null>(null)
export const useCourseWorkspace = () => useContext(WorkspaceContext)

/**
 * Every page under /courses/[id]. Where the learning environment is on, they open inside it; elsewhere (production)
 * they render exactly as before.
 */
export function CourseFrame({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>()
  const features = useFeatures()
  const id = Number(params?.id)
  if (!features) return null
  if (!features.learningLoop || !Number.isSafeInteger(id)) return <>{children}</>
  return (
    <CourseWorkspace key={id} courseId={id}>
      {children}
    </CourseWorkspace>
  )
}

function CourseWorkspace({ courseId, children }: { courseId: number; children: React.ReactNode }) {
  const user = useRequiredUser()
  const [detail, setDetail] = useState<CourseDetail | null>(null)

  const reload = useCallback(
    () =>
      getJSON<CourseDetail>(`/api/academy/courses/${courseId}?${clockQuery()}`).then(setDetail, () => {
        // The page inside shows what went wrong; the sidebar stays as it was.
      }),
    [courseId],
  )
  useEffect(() => {
    if (user) reload()
  }, [user, reload])

  const workspace = useMemo(() => ({ detail, reload }), [detail, reload])
  return (
    <WorkspaceContext.Provider value={workspace}>
      <LearnShell
        sidebar={detail ? <CourseSidebar detail={detail} /> : <SidebarPlaceholder />}
        rail={detail ? <CourseRail detail={detail} /> : <SidebarPlaceholder rail />}
        userEmail={user?.email ?? null}
      >
        {children}
      </LearnShell>
    </WorkspaceContext.Provider>
  )
}
