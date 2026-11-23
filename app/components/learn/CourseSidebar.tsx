'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { CourseDetail } from '../../lib/academy'
import type { LectureSummary } from '../../lib/views'
import { useLearnShell } from './shell'
import {
  ArrowLeftIcon,
  ChartIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardIcon,
  BookIcon,
  LayersIcon,
  PlayCircleIcon,
  PlusIcon,
  TempleIcon,
} from './icons'

// The course sidebar: the course, its sections, and its lectures in the order they were given. A lecture is done when
// every section of its lesson is read; the one open now is marked as current.

type Nav = {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  match: (path: string) => boolean
}

function navFor(courseId: number): Nav[] {
  const base = `/courses/${courseId}`
  return [
    { href: base, label: 'Overview', icon: TempleIcon, match: (p) => p === base },
    { href: `${base}/lectures`, label: 'Lectures', icon: BookIcon, match: (p) => p.startsWith(`${base}/lectures`) },
    {
      href: `${base}/assignments`,
      label: 'Assignments',
      icon: ClipboardIcon,
      match: (p) => p.startsWith(`${base}/assignments`),
    },
    {
      href: `${base}/materials`,
      label: 'Materials',
      icon: LayersIcon,
      match: (p) => p.startsWith(`${base}/materials`),
    },
    { href: `${base}/progress`, label: 'Progress', icon: ChartIcon, match: (p) => p.startsWith(`${base}/progress`) },
  ]
}

const lectureHref = (courseId: number, l: LectureSummary) =>
  l.status === 'mapped' ? `/courses/${courseId}/lectures/${l.id}` : `/materials/${l.id}`

export function lectureDone(l: LectureSummary) {
  return l.sections > 0 && l.completed >= l.sections
}

export function CourseSidebar({ detail }: { detail: CourseDetail }) {
  const path = usePathname() ?? ''
  const shell = useLearnShell()
  // On phones the sidebar is a drawer: following a link closes it.
  const onNavigate = () => shell?.closeDrawers()
  const router = useRouter()
  const course = detail.course
  const [switching, setSwitching] = useState(false)
  const lectures = (detail.lectures ?? []).filter((l) => l.role === 'lecture')
  const openLecture = /\/lectures\/(\d+)/.exec(path)?.[1]

  return (
    <nav aria-label={`${course.name} course`} className="flex h-full flex-col">
      <div className="px-5 pt-[22px]">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="inline-flex items-center gap-3 rounded-lg py-1 text-[0.95rem] text-ivory/90 no-underline hover:text-ivory"
        >
          <ArrowLeftIcon size={19} /> My Academy
        </Link>
      </div>

      <div className="relative mx-4 mt-3.5 border-y border-ivory/[0.12] py-3.5">
        <button
          type="button"
          onClick={() => setSwitching((v) => !v)}
          aria-expanded={switching}
          aria-haspopup="listbox"
          className="flex w-full items-center gap-3 rounded-xl p-1 text-left hover:bg-ivory/[0.06]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/learn/course-cover.webp"
            alt=""
            className="h-[58px] w-[64px] shrink-0 rounded-[10px] object-cover ring-1 ring-ivory/15 2xl:h-[62px] 2xl:w-[70px]"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[1.2rem] font-semibold leading-tight tracking-[-0.01em] 2xl:text-[1.3rem]">
              {course.code || course.name}
            </span>
            {course.code && <span className="mt-0.5 block truncate text-[0.88rem] text-ivory/80">{course.name}</span>}
          </span>
          <ChevronDownIcon size={18} />
        </button>
        {switching && (
          <ul
            role="listbox"
            aria-label="Switch course"
            className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-ivory/15 bg-[#183025] py-1.5 shadow-xl"
          >
            {detail.courses.map((c) => (
              <li key={c.id} role="option" aria-selected={c.id === course.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSwitching(false)
                    onNavigate?.()
                    router.push(`/courses/${c.id}`)
                  }}
                  className={`block w-full truncate px-4 py-2 text-left text-[0.95rem] hover:bg-ivory/[0.08] ${
                    c.id === course.id ? 'text-gold' : 'text-ivory'
                  }`}
                >
                  {c.code ? `${c.code} · ${c.name}` : c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3 [scrollbar-color:rgba(246,241,231,0.25)_transparent] [scrollbar-width:thin]">
        <ul className="space-y-[3px]">
          {navFor(course.id).map((item) => {
            const active = item.match(path) && !(item.label === 'Lectures' && openLecture)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3.5 rounded-[10px] px-3 py-[8px] text-[0.94rem] no-underline transition-colors ${
                    active || (item.label === 'Lectures' && openLecture)
                      ? 'bg-ivory/[0.2] text-ivory'
                      : 'text-ivory/[0.88] hover:bg-ivory/[0.08] hover:text-ivory'
                  }`}
                >
                  <Icon size={21} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 border-t border-ivory/[0.12] pt-[18px]">
          <p className="px-3 text-[0.74rem] font-medium uppercase tracking-[0.14em] text-ivory/75">
            Lectures (in order)
          </p>
          {lectures.length ? (
            <ol className="mt-2.5 space-y-[2px]">
              {lectures.map((l, i) => {
                const current = openLecture === String(l.id)
                const done = lectureDone(l)
                const started = !done && l.completed > 0
                return (
                  <li key={l.id}>
                    <Link
                      href={lectureHref(course.id, l)}
                      onClick={onNavigate}
                      aria-current={current ? 'page' : undefined}
                      className={`grid grid-cols-[22px_20px_1fr] items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[0.84rem] no-underline transition-colors ${
                        current ? 'bg-[#efe9d8] text-grove shadow-sm' : 'text-ivory/[0.92] hover:bg-ivory/[0.08]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={
                          current ? 'text-grove' : done ? 'text-ivory/90' : started ? 'text-gold' : 'text-ivory/30'
                        }
                      >
                        {current || started ? (
                          <PlayCircleIcon size={20} />
                        ) : done ? (
                          <CheckCircleIcon size={20} />
                        ) : (
                          <EmptyCircle />
                        )}
                      </span>
                      <span className={`text-right tabular-nums ${current ? 'font-semibold' : 'text-ivory/80'}`}>
                        {i + 1}
                      </span>
                      <span className={`truncate ${current ? 'font-semibold' : ''}`}>
                        {l.title}
                        <span className="sr-only">
                          {done ? ' (read)' : current ? ' (open now)' : started ? ' (started)' : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="mt-3 px-3 text-[0.92rem] text-ivory/70">No lectures yet.</p>
          )}
          <Link
            href={`/materials/new?course=${course.id}`}
            onClick={onNavigate}
            className="mx-2.5 mt-4 inline-flex items-center gap-2 rounded-full border border-ivory/25 px-3.5 py-1.5 text-[0.84rem] text-ivory no-underline hover:border-ivory/50"
          >
            <PlusIcon size={16} /> Add a lecture
          </Link>
        </div>
      </div>
    </nav>
  )
}

function EmptyCircle() {
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

/** The folded sidebar: the course and its sections as icons, each with its name for screen readers and on hover. */
export function CourseRail({ detail }: { detail: CourseDetail }) {
  const path = usePathname() ?? ''
  const course = detail.course
  return (
    <nav aria-label={`${course.name} course`} className="flex h-full flex-col items-center gap-2 py-5">
      <Link
        href="/dashboard"
        title="My Academy"
        aria-label="My Academy"
        className="grid size-11 place-items-center rounded-xl text-ivory/85 hover:bg-ivory/[0.08] hover:text-ivory"
      >
        <ArrowLeftIcon size={20} />
      </Link>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/learn/course-cover.webp"
        alt=""
        title={course.code ? `${course.code}, ${course.name}` : course.name}
        className="my-2 size-11 rounded-[10px] object-cover ring-1 ring-ivory/15"
      />
      {navFor(course.id).map((item) => {
        const Icon = item.icon
        const active = item.match(path)
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className={`grid size-11 place-items-center rounded-xl transition-colors ${
              active ? 'bg-ivory/[0.14] text-ivory' : 'text-ivory/80 hover:bg-ivory/[0.08] hover:text-ivory'
            }`}
          >
            <Icon size={21} />
          </Link>
        )
      })}
    </nav>
  )
}

/** The sidebar's frame while the course loads, so nothing shifts when it arrives. */
export function SidebarPlaceholder({ rail = false }: { rail?: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the course"
      className={`flex h-full flex-col gap-3 ${rail ? 'items-center py-5' : 'p-5'}`}
    >
      {(rail ? [44, 44, 44, 44, 44] : [120, 230, 180, 160, 190, 150]).map((w, i) => (
        <span
          key={i}
          className="block h-9 animate-pulse rounded-xl bg-ivory/[0.08] motion-reduce:animate-none"
          style={{ width: rail ? 44 : w }}
        />
      ))}
    </div>
  )
}
