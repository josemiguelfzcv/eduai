'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from '../learn/icons'
import { useAcademy } from './academy'
import { useLocation } from './location'

type Crumb = { label: string; href?: string }

const PARTS: Record<string, string> = {
  lectures: 'Lectures',
  assignments: 'Assignments',
  materials: 'Materials',
  'knowledge-map': 'Knowledge Map',
}

/** Where the page sits in the academy, each step a link back up: My Academy / MATH 341 / Lecture 6. */
export function useCrumbs(): Crumb[] {
  const where = useLocation()
  const academy = useAcademy()
  const home: Crumb = { label: 'My Academy', href: '/dashboard' }
  const path = where.path

  if (where.courseId !== null) {
    const course = academy?.courses?.find((c) => c.id === where.courseId)
    const detail = academy?.details[where.courseId]
    const courseCrumb: Crumb = {
      label: course ? course.code || course.name : 'Course',
      href: `/courses/${where.courseId}`,
    }
    if (where.section === 'overview' || where.section === null) return [home, { label: courseCrumb.label }]
    if (where.itemId === null) return [home, courseCrumb, { label: PARTS[where.section] }]
    const materials = detail?.lectures ?? []
    const item = materials.find((m) => m.id === where.itemId)
    if (where.section === 'lectures') {
      const n = materials.filter((m) => m.role === 'lecture').findIndex((m) => m.id === where.itemId)
      return [home, courseCrumb, { label: n >= 0 ? `Lecture ${n + 1}` : (item?.title ?? 'Lecture') }]
    }
    return [home, courseCrumb, { label: item?.title ?? 'Assignment' }]
  }

  if (path.startsWith('/study-plan')) return [home, { label: 'Study Plan' }]
  if (path.startsWith('/progress')) return [home, { label: 'Global Progress' }]
  if (path.startsWith('/lyceum')) return [home, { label: 'The Lyceum' }]
  if (path.startsWith('/profile')) return [home, { label: 'Profile' }]
  if (path.startsWith('/sessions/')) return [home, { label: 'Quick Check' }]
  if (path === '/materials/new') return [home, { label: 'Add material' }]
  const material = /^\/materials\/(\d+)/.exec(path)
  if (material && academy) {
    const id = Number(material[1])
    for (const [courseId, detail] of Object.entries(academy.details)) {
      const found = detail?.lectures?.find((m) => m.id === id)
      if (found && detail)
        return [
          home,
          { label: detail.course.code || detail.course.name, href: `/courses/${courseId}` },
          { label: found.title },
        ]
    }
    return [home, { label: 'Material' }]
  }
  return []
}

export function Breadcrumbs({ className = '' }: { className?: string }) {
  const crumbs = useCrumbs()
  if (crumbs.length < 2) return null
  const up = [...crumbs].reverse().find((c) => c.href)
  return (
    <div className={`flex items-center gap-2.5 text-[0.86rem] ${className}`}>
      {up?.href && (
        <Link
          href={up.href}
          aria-label={`Back to ${up.label}`}
          className="grid size-8 place-items-center rounded-full text-[#2a2924] no-underline hover:bg-ink/[0.06]"
        >
          <ArrowLeftIcon size={18} />
        </Link>
      )}
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-x-2 text-ink-soft">
          {crumbs.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">/</span>}
              {c.href && i < crumbs.length - 1 ? (
                <Link
                  href={c.href}
                  className="text-[#3a3a33] no-underline hover:text-ink hover:underline hover:underline-offset-4"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" className="font-medium text-[#1d1c19]">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}
