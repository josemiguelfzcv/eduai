'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { AcademyCourse } from '../../lib/academy'
import type { LectureSummary } from '../../lib/views'
import { CourseForm } from '../academy/CourseForm'
import {
  BookIcon,
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClipboardIcon,
  CloseIcon,
  HomeIcon,
  LayersIcon,
  NetworkIcon,
  PlayCircleIcon,
  PlusIcon,
  SidebarIcon,
} from '../learn/icons'
import { LaurelMark } from '../learn/LaurelMark'
import { useAcademy } from './academy'
import { useLocation, type Section } from './location'
import { CourseGlyph } from './glyph'
import { usePreference, usePreferenceSet } from './store'

// The one navigation of Lyceo. Always the same three places, then the student's courses; each course opens into the
// same five parts (Overview, Lectures, Assignments, Materials, Knowledge Map), and Lectures and Assignments open into
// their lists. The course and the activity on screen are highlighted. Which courses and lists are open is remembered.

type Icon = React.ComponentType<{ size?: number }>

export const COURSE_PARTS: { section: Section; label: string; icon: Icon; path: string }[] = [
  { section: 'overview', label: 'Overview', icon: HomeIcon, path: '' },
  { section: 'lectures', label: 'Lectures', icon: BookIcon, path: '/lectures' },
  { section: 'assignments', label: 'Assignments', icon: ClipboardIcon, path: '/assignments' },
  { section: 'materials', label: 'Materials', icon: LayersIcon, path: '/materials' },
  { section: 'knowledge-map', label: 'Knowledge Map', icon: NetworkIcon, path: '/knowledge-map' },
]

export const GLOBAL_PLACES: { href: string; label: string; icon: Icon; match: (path: string) => boolean }[] = [
  { href: '/dashboard', label: 'My Academy', icon: HomeIcon, match: (p) => p === '/dashboard' },
  { href: '/study-plan', label: 'Study Plan', icon: CalendarIcon, match: (p) => p.startsWith('/study-plan') },
  { href: '/progress', label: 'Global Progress', icon: ChartIcon, match: (p) => p.startsWith('/progress') },
]

export const lectureHref = (courseId: number, m: LectureSummary) =>
  m.status === 'mapped' ? `/courses/${courseId}/lectures/${m.id}` : `/materials/${m.id}`
export const assignmentHref = (courseId: number, m: LectureSummary) =>
  m.status === 'mapped' ? `/courses/${courseId}/assignments/${m.id}` : `/materials/${m.id}`

const isRead = (m: LectureSummary) => m.sections > 0 && m.completed >= m.sections

/** Keeps the course on screen, and the list holding the activity on screen, open. */
function useOpenState() {
  const where = useLocation()
  const [courses, updateCourses] = usePreferenceSet('lyceo.nav.courses')
  const [sections, updateSections] = usePreferenceSet('lyceo.nav.sections')
  const course = where.courseId
  const list = where.section === 'lectures' || where.section === 'assignments' ? where.section : null
  const hasItem = where.itemId !== null
  useEffect(() => {
    if (course === null) return
    updateCourses((s) => s.add(String(course)))
    if (list && hasItem) updateSections((s) => s.add(`${course}:${list}`))
  }, [course, list, hasItem, updateCourses, updateSections])
  return { where, courses, updateCourses, sections, updateSections }
}

export function GlobalSidebar({ onCollapse }: { onCollapse: () => void }) {
  const academy = useAcademy()
  const router = useRouter()
  const { where, courses: openCourses, updateCourses, sections, updateSections } = useOpenState()
  const [adding, setAdding] = useState(false)
  const loadCourse = academy?.loadCourse
  const openKey = [...openCourses].sort().join(',')

  // The lists of open courses come from their details.
  useEffect(() => {
    if (!loadCourse || !openKey) return
    for (const id of openKey.split(',')) if (Number.isSafeInteger(Number(id))) loadCourse(Number(id))
  }, [loadCourse, openKey])

  // Bring the activity on screen into view in the sidebar.
  const activeRef = useRef<HTMLAnchorElement | null>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [where.path])

  const courses = academy?.courses
  const [list, setList] = usePreference('lyceo.nav.courseList', 'open', ['open', 'closed'] as const)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[70px] shrink-0 items-center justify-between pl-8 pr-3.5">
        <Link
          href="/dashboard"
          aria-label="Lyceo, My Academy"
          className="flex items-center gap-2.5 rounded-lg text-ivory no-underline"
        >
          <LaurelMark size={38} className="text-[#e9dcae]" />
          <span className="font-display text-[2.05rem] font-medium leading-none tracking-[-0.01em]">Lyceo</span>
        </Link>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse the sidebar"
          aria-expanded
          aria-controls="app-sidebar"
          title="Collapse the sidebar"
          className="grid size-9 place-items-center rounded-lg text-ivory/40 transition-colors hover:bg-ivory/[0.08] hover:text-ivory"
        >
          <SidebarIcon size={19} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 [scrollbar-color:rgba(246,241,231,0.25)_transparent] [scrollbar-width:thin]">
        <p className="px-3 font-display text-[1.62rem] font-medium tracking-[-0.01em] text-ivory">My Academy</p>
        <ul className="mt-3 space-y-0.5">
          {GLOBAL_PLACES.map((place) => {
            const active = place.match(where.path)
            const Icon = place.icon
            return (
              <li key={place.href}>
                <Link
                  href={place.href}
                  ref={active ? activeRef : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-[18px] rounded-[12px] px-[18px] py-[10px] text-[1.1rem] leading-[1.3] no-underline transition-colors ${
                    active ? 'bg-ivory/[0.16] text-ivory' : 'text-ivory/[0.9] hover:bg-ivory/[0.08] hover:text-ivory'
                  }`}
                >
                  <Icon size={23} />
                  {place.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="mx-3 mb-4 mt-5 border-t border-ivory/[0.16]" />
        <button
          type="button"
          onClick={() => setList(list === 'open' ? 'closed' : 'open')}
          aria-expanded={list === 'open'}
          className="flex w-full items-center justify-between rounded-lg px-3 py-1 text-left text-ivory"
        >
          <span className="font-display text-[1.5rem] font-medium tracking-[-0.01em]">Your Courses</span>
          {list === 'open' ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
        </button>

        {list === 'closed' ? null : courses === null || courses === undefined ? (
          <div className="mt-3 space-y-2 px-1" aria-busy="true" aria-label="Loading your courses">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="block h-12 animate-pulse rounded-xl bg-ivory/[0.07] motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <p className="mt-3 px-3 text-[0.92rem] text-ivory/70">No courses yet.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {courses.map((course) => (
              <CourseNav
                key={course.id}
                course={course}
                open={openCourses.has(String(course.id))}
                onToggle={() =>
                  updateCourses((s) =>
                    s.has(String(course.id)) ? s.delete(String(course.id)) : s.add(String(course.id)),
                  )
                }
                onSelect={() => updateCourses((s) => s.add(String(course.id)))}
                sections={sections}
                onToggleSection={(key) => updateSections((s) => (s.has(key) ? s.delete(key) : s.add(key)))}
                activeRef={activeRef}
              />
            ))}
          </ul>
        )}

        {list === 'open' && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 flex w-full items-center gap-[18px] rounded-[12px] px-[18px] py-2.5 text-[1rem] text-ivory/[0.85] hover:bg-ivory/[0.08] hover:text-ivory"
          >
            <PlusIcon size={21} /> Add Course
          </button>
        )}
      </div>

      {adding && (
        <AddCourseDialog
          onClose={() => setAdding(false)}
          onSaved={async (course) => {
            setAdding(false)
            await academy?.reloadCourses()
            updateCourses((s) => s.add(String(course.id)))
            router.push(`/courses/${course.id}`)
          }}
        />
      )}
    </div>
  )
}

function CourseNav({
  course,
  open,
  onToggle,
  onSelect,
  sections,
  onToggleSection,
  activeRef,
}: {
  course: AcademyCourse
  open: boolean
  onToggle: () => void
  onSelect: () => void
  sections: Set<string>
  onToggleSection: (key: string) => void
  activeRef: React.RefObject<HTMLAnchorElement | null>
}) {
  const academy = useAcademy()
  const where = useLocation()
  const detail = academy?.details[course.id]
  const here = where.courseId === course.id
  const base = `/courses/${course.id}`
  const materials = detail?.lectures ?? []
  const lectures = materials.filter((m) => m.role === 'lecture')
  const assignments = materials.filter((m) => m.role === 'assignment')
  const title = course.code || course.name

  return (
    <li>
      <div
        className={`group flex items-center rounded-xl transition-colors ${
          here ? 'bg-ivory/[0.13] ring-1 ring-ivory/[0.12]' : 'hover:bg-ivory/[0.07]'
        }`}
      >
        <Link
          href={base}
          onClick={onSelect}
          ref={here && where.section === 'overview' && !where.itemId ? activeRef : undefined}
          aria-current={here && where.section === 'overview' ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 no-underline"
        >
          <CourseGlyph course={course} size={42} tone="mist" />
          <span className="min-w-0">
            <span className="block truncate text-[1.1rem] font-medium leading-tight text-ivory">{title}</span>
            {course.code && <span className="block truncate text-[0.88rem] text-ivory/80">{course.name}</span>}
          </span>
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Close' : 'Open'} ${title}`}
          className="mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-ivory/80 hover:bg-ivory/[0.1] hover:text-ivory"
        >
          {open ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
        </button>
      </div>

      {open && (
        <ul className="mb-2 ml-[26px] mt-1 space-y-[2px] border-l border-ivory/[0.14] pl-2.5">
          {COURSE_PARTS.map((part) => {
            const active = here && where.section === part.section && where.itemId === null
            const list = part.section === 'lectures' ? lectures : part.section === 'assignments' ? assignments : null
            const key = `${course.id}:${part.section}`
            const listOpen = list !== null && sections.has(key)
            const Icon = part.icon
            return (
              <li key={part.section}>
                <div className="flex items-center">
                  <Link
                    href={`${base}${part.path}`}
                    ref={active ? activeRef : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 py-[6px] text-[0.88rem] no-underline transition-colors ${
                      active
                        ? 'bg-ivory/[0.2] font-medium text-ivory'
                        : here && where.section === part.section
                          ? 'text-ivory'
                          : 'text-ivory/[0.84] hover:bg-ivory/[0.08] hover:text-ivory'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="truncate">{part.label}</span>
                  </Link>
                  {list !== null && (
                    <button
                      type="button"
                      onClick={() => onToggleSection(key)}
                      aria-expanded={listOpen}
                      aria-label={`${listOpen ? 'Hide' : 'Show'} the ${part.label.toLowerCase()} of ${title}`}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-ivory/70 hover:bg-ivory/[0.1] hover:text-ivory"
                    >
                      {listOpen ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}
                    </button>
                  )}
                </div>
                {listOpen && list && (
                  <ActivityList
                    items={list}
                    numbered={part.section === 'lectures'}
                    loading={!detail}
                    href={(m) =>
                      part.section === 'lectures' ? lectureHref(course.id, m) : assignmentHref(course.id, m)
                    }
                    activeId={here && where.section === part.section ? where.itemId : null}
                    activeRef={activeRef}
                    empty={part.section === 'lectures' ? 'No lectures yet' : 'No assignments yet'}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

function ActivityList({
  items,
  numbered,
  loading,
  href,
  activeId,
  activeRef,
  empty,
}: {
  items: LectureSummary[]
  numbered: boolean
  loading: boolean
  href: (m: LectureSummary) => string
  activeId: number | null
  activeRef: React.RefObject<HTMLAnchorElement | null>
  empty: string
}) {
  if (loading) return <p className="py-1.5 pl-9 text-[0.8rem] text-ivory/60">Loading</p>
  if (!items.length) return <p className="py-1.5 pl-9 text-[0.8rem] text-ivory/60">{empty}</p>
  return (
    <ol className="mb-1 mt-0.5 space-y-[1px]">
      {items.map((m, i) => {
        const active = activeId === m.id
        const read = isRead(m)
        const started = !read && m.completed > 0
        return (
          <li key={m.id}>
            <Link
              href={href(m)}
              ref={active ? activeRef : undefined}
              aria-current={active ? 'page' : undefined}
              className={`grid grid-cols-[18px_auto_1fr] items-center gap-2 rounded-[8px] py-[5px] pl-2 pr-2 text-[0.8rem] no-underline transition-colors ${
                active ? 'bg-[#efe9d8] font-semibold text-grove shadow-sm' : 'text-ivory/[0.86] hover:bg-ivory/[0.08]'
              }`}
            >
              <span
                aria-hidden="true"
                className={active ? 'text-grove' : read ? 'text-ivory/85' : started ? 'text-gold' : 'text-ivory/30'}
              >
                {active || started ? <PlayCircleIcon size={16} /> : read ? <CheckCircleIcon size={16} /> : <Dot />}
              </span>
              <span className={`tabular-nums ${active ? '' : 'text-ivory/70'}`}>{numbered ? i + 1 : ''}</span>
              <span className="truncate">
                {m.title}
                <span className="sr-only">{read ? ' (read)' : started ? ' (started)' : ''}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

function Dot() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  )
}

/** The folded sidebar: the three places and the courses as icons, then the parts of the course on screen. */
export function SidebarRail({ onExpand }: { onExpand: () => void }) {
  const academy = useAcademy()
  const where = useLocation()
  const item = (active: boolean) =>
    `grid size-11 place-items-center rounded-xl transition-colors ${
      active ? 'bg-ivory/[0.18] text-ivory' : 'text-ivory/80 hover:bg-ivory/[0.08] hover:text-ivory'
    }`
  return (
    <div className="flex h-full flex-col items-center gap-1.5 overflow-y-auto pb-4 pt-[17px] [scrollbar-width:none]">
      <Link href="/dashboard" aria-label="Lyceo, My Academy" title="Lyceo" className="rounded-lg text-[#e9dcae]">
        <LaurelMark size={38} />
      </Link>
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand the sidebar"
        aria-expanded={false}
        aria-controls="app-sidebar"
        title="Expand the sidebar"
        className="mb-2 mt-1 grid size-9 place-items-center rounded-lg text-ivory/55 transition-colors hover:bg-ivory/[0.08] hover:text-ivory"
      >
        <SidebarIcon size={19} />
      </button>
      {GLOBAL_PLACES.map((place) => {
        const Icon = place.icon
        const active = place.match(where.path)
        return (
          <Link
            key={place.href}
            href={place.href}
            title={place.label}
            aria-label={place.label}
            aria-current={active ? 'page' : undefined}
            className={item(active)}
          >
            <Icon size={21} />
          </Link>
        )
      })}
      <span className="my-2 h-px w-8 bg-ivory/[0.14]" />
      {(academy?.courses ?? []).map((course) => {
        const here = where.courseId === course.id
        const title = course.code ? `${course.code}, ${course.name}` : course.name
        return (
          <Link
            key={course.id}
            href={`/courses/${course.id}`}
            title={title}
            aria-label={title}
            aria-current={here && where.section === 'overview' ? 'page' : undefined}
            className={`rounded-[12px] p-[3px] ${here ? 'ring-2 ring-gold' : 'hover:ring-1 hover:ring-ivory/40'}`}
          >
            <CourseGlyph course={course} size={40} tone="mist" />
          </Link>
        )
      })}
      {where.courseId !== null && (
        <>
          <span className="my-2 h-px w-8 bg-ivory/[0.14]" />
          {COURSE_PARTS.map((part) => {
            const Icon = part.icon
            const active = where.section === part.section
            return (
              <Link
                key={part.section}
                href={`/courses/${where.courseId}${part.path}`}
                title={part.label}
                aria-label={part.label}
                aria-current={active && where.itemId === null ? 'page' : undefined}
                className={item(active)}
              >
                <Icon size={20} />
              </Link>
            )
          })}
        </>
      )}
    </div>
  )
}

export function AddCourseDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (course: AcademyCourse) => void
}) {
  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-6 backdrop-blur-[1px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-course-title"
        className="w-full max-w-lg rounded-[20px] bg-[#fbf6ee] p-6 text-ink shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="add-course-title" className="font-display text-[1.5rem] font-semibold">
            Add a course
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-ink/[0.05]"
          >
            <CloseIcon size={19} />
          </button>
        </div>
        <CourseForm onSaved={onSaved} onCancel={onClose} />
      </div>
    </div>
  )
}
