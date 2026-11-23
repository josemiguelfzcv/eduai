'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AcademyCourse, StudyAction } from '../../lib/academy'
import { shortDay } from '../../lib/mastery'
import {
  ActivityIcon,
  BookIcon,
  CalendarIcon,
  CapIcon,
  ChartIcon,
  ChevronRightIcon,
  GridIcon,
  ListIcon,
  TargetIcon,
} from '../learn/icons'
import { useAcademy, useAllCourses, useSnapshot } from '../shell/academy'
import { useCourseArt } from '../shell/art'
import { CourseGlyph } from '../shell/glyph'
import { AddCourseDialog, lectureHref } from '../shell/Sidebar'
import { usePreference } from '../shell/store'
import {
  Bar,
  Card,
  courseTitle,
  DateTile,
  dayLabel,
  EmptyNote,
  FeatureCard,
  minutesLabel,
  ModulePage,
  MoreLink,
  percent,
  Ring,
  Stat,
  StatStrip,
  StepIcon,
  StepTrigger,
  Tag,
  useStepStarter,
  Waiting,
} from './board'
import { kindLabel } from './format'
import { SetupNotice } from './SetupNotice'

// My Academy, as designed: the student's home. Four figures across the top, the lecture to pick up, what to study
// next, what's due this week, what they did last, and their courses. "Progress" here is reading: the share of a
// course's lesson sections the student has read. (What they have proven they know is Global Progress.)

const DESCRIPTION =
  'Your home base for all courses. Keep learning, stay on track, and make progress across your studies.'

export function MyAcademyBoard() {
  const { snapshot, problem, reload } = useSnapshot()
  const { courses, details } = useAllCourses()
  const academy = useAcademy()
  const art = useCourseArt()
  const starter = useStepStarter()
  const router = useRouter()
  const [view, setView] = usePreference('lyceo.academy.courses', 'grid', ['grid', 'list'] as const)
  const [adding, setAdding] = useState(false)

  if (!snapshot)
    return (
      <ModulePage title="My Academy" description={DESCRIPTION}>
        {problem?.setup ? (
          <SetupNotice />
        ) : problem ? (
          <Card title="My Academy couldn’t open">
            <p role="alert" className="m-0 text-[#4b4a43]">
              {problem.message}
            </p>
            <button type="button" className="btn btn-quiet mt-4" onClick={reload}>
              Try again
            </button>
          </Card>
        ) : (
          <Card title="Opening My Academy">
            <Waiting lines={4} />
          </Card>
        )}
      </ModulePage>
    )

  const list: AcademyCourse[] = courses ?? snapshot.courses
  const today = snapshot.today
  const codeOf = (id: number | null, fallback: string | null) => {
    const course = list.find((c) => c.id === id)
    return course ? courseTitle(course) : fallback
  }

  // Reading, course by course: lesson sections read out of those planned.
  const reading = list.map((course) => {
    const lectures = (details[course.id]?.lectures ?? []).filter((l) => l.role === 'lecture')
    const sections = lectures.reduce((n, l) => n + l.sections, 0)
    const read = lectures.reduce((n, l) => n + Math.min(l.completed, l.sections), 0)
    return { course, loaded: !!details[course.id], lectures, sections, read }
  })
  const sections = reading.reduce((n, r) => n + r.sections, 0)
  const read = reading.reduce((n, r) => n + r.read, 0)
  const loaded = reading.every((r) => r.loaded)

  // The lecture to pick up: the one opened last that isn't finished, else the first not yet read.
  const unfinished = reading.flatMap((r) =>
    r.lectures
      .map((lecture, i) => ({ course: r.course, lecture, number: i + 1 }))
      .filter(({ lecture }) => lecture.status === 'mapped' && lecture.completed < Math.max(lecture.sections, 1)),
  )
  const resume =
    unfinished
      .filter((u) => u.lecture.openedAt)
      .sort((a, b) => b.lecture.openedAt!.localeCompare(a.lecture.openedAt!))[0] ??
    unfinished[0] ??
    null

  const upcoming = snapshot.deadlines.filter((d) => !d.completedAt && d.daysLeft >= 0)
  const week = upcoming.filter((d) => d.daysLeft <= 7)
  const minutes = snapshot.plan.reduce((n, a) => n + a.minutes, 0)

  // What happened last, from the records: lectures opened, ideas confirmed, the latest Quick Check.
  const activity = [
    ...reading.flatMap((r) =>
      r.lectures
        .filter((l) => l.openedAt)
        .map((l) => ({
          key: `lecture-${l.id}`,
          at: l.openedAt!,
          done: l.sections > 0 && l.completed >= l.sections,
          title: l.title,
          meta: `${courseTitle(r.course)} · ${
            l.sections ? `${Math.min(l.completed, l.sections)} of ${l.sections} sections read` : 'Opened'
          }`,
          href: lectureHref(r.course.id, l),
        })),
    ),
    ...list.flatMap((course) =>
      (details[course.id]?.ideas ?? [])
        .filter((idea) => idea.confirmedOn)
        .map((idea) => ({
          key: `idea-${idea.id}`,
          at: `${idea.confirmedOn}T23:59:59`,
          done: true,
          title: `Confirmed: ${idea.name}`,
          meta: courseTitle(course),
          href: `/courses/${course.id}/knowledge-map`,
        })),
    ),
    ...(snapshot.sinceLastTime
      ? [
          {
            key: 'session',
            at: snapshot.sinceLastTime.lastActiveAt,
            done: snapshot.sinceLastTime.status === 'completed',
            title: snapshot.sinceLastTime.status === 'active' ? 'Quick Check, left open' : 'Quick Check',
            meta: snapshot.sinceLastTime.courseName ?? 'Across your courses',
            href: `/sessions/${snapshot.sinceLastTime.sessionId}`,
          },
        ]
      : []),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3)

  const newcomer = list.length === 0

  return (
    <ModulePage title="My Academy" description={DESCRIPTION}>
      <StatStrip>
        <Stat
          icon={<CapIcon size={36} />}
          value={`${list.length} ${list.length === 1 ? 'Course' : 'Courses'}`}
          label="This term"
        />
        <Stat
          icon={<Ring value={sections ? read / sections : 0} />}
          value={loaded || sections ? percent(sections ? read / sections : 0) : '…'}
          label="Overall progress"
          title={`${read} of ${sections} lesson sections read, across your courses`}
        />
        <Stat
          icon={<CalendarIcon size={34} />}
          value={`${week.length} Upcoming ${week.length === 1 ? 'deadline' : 'deadlines'}`}
          label="Next 7 days"
        />
        <Stat
          icon={<ChartIcon size={34} />}
          value={minutesLabel(minutes)}
          label="In your study plan"
          title="The time the next steps of your plan take"
        />
      </StatStrip>

      {newcomer ? (
        <Card title="Set up your academy" subtitle="Three steps and Lyceo can plan your study.">
          <ol className="m-0 grid list-none gap-5 p-0 sm:grid-cols-3">
            {[
              ['Add your courses', 'The classes you’re taking this term.'],
              ['Add a lecture', 'Slides or a recording from one class. Lyceo turns it into a lesson.'],
              ['Add your next exam', 'Lyceo uses the date to decide what to study first.'],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="font-display text-[1.5rem] leading-none text-[#8a6412]" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-[0.92rem] text-[#4b4a43]">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-primary mt-6" onClick={() => setAdding(true)}>
            Add your first course
          </button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,0.97fr)_minmax(0,1fr)] items-start gap-[22px]">
            <FeatureCard icon={<BookIcon size={30} />} title="Continue Learning" subtitle="Pick up where you left off.">
              {resume ? (
                <Link
                  href={lectureHref(resume.course.id, resume.lecture)}
                  className="group block rounded-[14px] px-6 pb-5 pt-[18px] text-ink no-underline"
                >
                  <span className="flex items-center gap-[18px]">
                    <CourseGlyph course={resume.course} size={52} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[1.24rem] font-semibold leading-snug">
                        {resume.course.code ? `${resume.course.code} · ${resume.course.name}` : resume.course.name}
                      </span>
                      <span className="block truncate text-[1rem] text-[#33342f]">
                        {resume.number} {resume.lecture.title}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#e3b84b] text-[#2d2206] shadow-[0_4px_10px_-5px_rgba(120,85,10,0.8)] transition-transform group-hover:scale-105 motion-reduce:transition-none"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 2.2v11.6a.6.6 0 0 0 .9.5l9.2-5.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z" />
                      </svg>
                    </span>
                  </span>
                  <span className="mt-4 flex items-center gap-4 pl-[70px]">
                    <Bar
                      value={resume.lecture.sections ? resume.lecture.completed / resume.lecture.sections : 0}
                      className="flex-1"
                    />
                    <span className="w-11 text-right text-[0.95rem] text-[#33342f]">
                      {percent(resume.lecture.sections ? resume.lecture.completed / resume.lecture.sections : 0)}
                    </span>
                  </span>
                  <span className="sr-only">Open this lecture</span>
                </Link>
              ) : (
                <div className="px-6 py-6">
                  <EmptyNote>
                    {!loaded
                      ? 'Opening your lectures'
                      : reading.some((r) => r.lectures.length)
                        ? 'You’ve read every lecture you added. Add the next one from its course.'
                        : 'Add a lecture to one of your courses and Lyceo turns it into a lesson to read here.'}
                  </EmptyNote>
                </div>
              )}
            </FeatureCard>

            <Card
              icon={<TargetIcon size={30} />}
              title="What to study next"
              subtitle="A personalized next step across your courses."
            >
              {snapshot.plan.length ? (
                <ul className="m-0 list-none p-0">
                  {snapshot.plan.slice(0, 3).map((a, i) => (
                    <li key={a.key} className={i > 1 ? 'border-t border-[#ece2d1]' : ''}>
                      <NextStep action={a} first={i === 0} code={codeOf(a.courseId, a.courseName)} starter={starter} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>You’re caught up. New steps appear here as lectures and deadlines come in.</EmptyNote>
              )}
              {starter.error && (
                <p role="alert" className="mb-0 mt-2 text-[0.9rem] text-terracotta">
                  {starter.error}
                </p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-2 items-start gap-[22px]">
            <Card
              icon={<CalendarIcon size={30} />}
              title="Upcoming deadlines"
              subtitle="Next 7 days across all courses."
              action={<MoreLink href="/study-plan">View all</MoreLink>}
            >
              {week.length ? (
                <ul className="m-0 list-none divide-y divide-[#ece2d1] p-0">
                  {week.slice(0, 3).map((d) => (
                    <li key={d.id} className="flex items-center gap-5 py-[5px] first:pt-0 last:pb-0">
                      <DateTile iso={d.dueOn} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.98rem] font-medium leading-[1.3]">{d.title}</span>
                        <span className="block truncate text-[0.88rem] leading-[1.35] text-[#4b4a43]">
                          {codeOf(d.courseId, d.courseName)} · {kindLabel(d.kind)}
                        </span>
                      </span>
                      <Tag>{d.daysLeft === 0 ? 'Today' : d.daysLeft === 1 ? 'Tomorrow' : `In ${d.daysLeft} days`}</Tag>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>
                  Nothing is due in the next 7 days.
                  {upcoming[0] && ` Next: ${upcoming[0].title}, ${shortDay(upcoming[0].dueOn)}.`}
                </EmptyNote>
              )}
            </Card>

            <Card
              icon={<ActivityIcon size={30} />}
              title="Recent activity"
              subtitle="Your latest learning progress."
              action={<MoreLink href="/progress">View all</MoreLink>}
            >
              {activity.length ? (
                <ul className="m-0 list-none divide-y divide-[#ece2d1] p-0">
                  {activity.map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-5 py-[5px] text-ink no-underline hover:text-[#1f4a2c]"
                      >
                        <span className="grid w-[30px] shrink-0 place-items-center text-[#1f4a2c]" aria-hidden="true">
                          {item.done ? <Done /> : <BookIcon size={27} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.98rem] font-medium leading-[1.3]">{item.title}</span>
                          <span className="block truncate text-[0.88rem] leading-[1.35] text-[#4b4a43]">
                            {item.meta} · {dayLabel(item.at.slice(0, 10), today)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : loaded ? (
                <EmptyNote>Open a lecture or answer a Quick Check and it shows here.</EmptyNote>
              ) : (
                <Waiting />
              )}
            </Card>
          </div>

          <section aria-labelledby="your-courses">
            <div className="flex items-end justify-between gap-6">
              <div>
                <h2
                  id="your-courses"
                  className="font-display text-[1.85rem] font-semibold leading-tight tracking-[-0.01em] text-[#1d1c19]"
                >
                  Your Courses
                </h2>
                <p className="mt-0.5 text-[0.98rem] text-[#4b4a43]">
                  All your courses in one place. Track progress, open course materials, and jump back in.
                </p>
              </div>
              <div
                role="group"
                aria-label="Show your courses as"
                className="flex shrink-0 overflow-hidden rounded-[11px] border border-[#e6dccb] bg-[#fdf9f2]"
              >
                {(['grid', 'list'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setView(mode)}
                    aria-pressed={view === mode}
                    aria-label={mode === 'grid' ? 'Cards' : 'A list'}
                    className={`grid h-[38px] w-[52px] place-items-center text-[#1d1c19] ${view === mode ? 'bg-[#e9e6d0]' : 'hover:bg-[#f4ecde]'}`}
                  >
                    {mode === 'grid' ? <GridIcon size={21} /> : <ListIcon size={21} />}
                  </button>
                ))}
              </div>
            </div>

            {view === 'grid' ? (
              <ul className="m-0 mt-4 grid list-none grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-4 p-0">
                {reading.map((r) => (
                  <li key={r.course.id}>
                    <Link
                      href={`/courses/${r.course.id}`}
                      className="block rounded-[18px] border border-[#eee3d2] bg-[#fdf8f0] p-2 text-ink no-underline shadow-[0_4px_18px_-10px_rgba(95,65,25,0.22)] transition-shadow hover:shadow-[0_10px_24px_-12px_rgba(95,65,25,0.4)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={art.thumb(r.course.id)}
                        alt=""
                        loading="lazy"
                        className="h-[72px] w-full rounded-[11px] object-cover"
                      />
                      <span className="flex items-center gap-3.5 px-2.5 pt-3.5">
                        <CourseGlyph course={r.course} size={46} tone="grove" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[1.12rem] font-semibold leading-snug">
                            {courseTitle(r.course)}
                          </span>
                          {r.course.code && (
                            <span className="block truncate text-[0.92rem] text-[#4b4a43]">{r.course.name}</span>
                          )}
                        </span>
                        <ChevronRightIcon size={18} />
                      </span>
                      <CourseReading reading={r} className="px-2.5 pb-2.5 pt-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="m-0 mt-4 list-none divide-y divide-[#ece2d1] rounded-[18px] border border-[#eee3d2] bg-[#fdf8f0] px-5 shadow-[0_4px_18px_-10px_rgba(95,65,25,0.22)]">
                {reading.map((r) => (
                  <li key={r.course.id}>
                    <Link
                      href={`/courses/${r.course.id}`}
                      className="flex items-center gap-4 py-3.5 text-ink no-underline"
                    >
                      <CourseGlyph course={r.course} size={42} tone="grove" />
                      <span className="w-[32%] min-w-0">
                        <span className="block truncate text-[1.06rem] font-semibold">{courseTitle(r.course)}</span>
                        {r.course.code && (
                          <span className="block truncate text-[0.88rem] leading-[1.35] text-[#4b4a43]">
                            {r.course.name}
                          </span>
                        )}
                      </span>
                      <CourseReading reading={r} className="flex-1" />
                      <ChevronRightIcon size={18} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {adding && (
        <AddCourseDialog
          onClose={() => setAdding(false)}
          onSaved={async (course) => {
            setAdding(false)
            await academy?.reloadCourses()
            reload()
            router.push(`/courses/${course.id}`)
          }}
        />
      )}
    </ModulePage>
  )
}

function NextStep({
  action,
  first,
  code,
  starter,
}: {
  action: StudyAction
  first: boolean
  code: string | null
  starter: ReturnType<typeof useStepStarter>
}) {
  const writing = starter.busy === action.key
  return (
    <StepTrigger
      action={action}
      starter={starter}
      className={`flex w-full items-center gap-4 rounded-[10px] px-3.5 py-[5px] text-left text-ink no-underline transition-colors disabled:opacity-70 ${
        first ? 'bg-[#efe9d3] hover:bg-[#e9e2c8]' : 'hover:bg-[#f4ecde]'
      }`}
    >
      <span
        aria-hidden="true"
        className="grid size-[27px] shrink-0 place-items-center rounded-[7px] border border-[#cfc5b1] bg-[#fdfaf4] text-[#1f4a2c]"
      >
        <StepIcon kind={action.kind} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.98rem] font-medium leading-[1.3]">{action.title}</span>
        <span className="block truncate text-[0.88rem] leading-[1.35] text-[#4b4a43]">
          {writing ? 'Writing your questions' : [code, `~${action.minutes} min`].filter(Boolean).join(' · ')}
        </span>
      </span>
      {first && <Tag>Recommended</Tag>}
    </StepTrigger>
  )
}

/** A course's reading as a bar and its share, or what's missing to have one. */
function CourseReading({
  reading,
  className = '',
}: {
  reading: { loaded: boolean; sections: number; read: number; lectures: unknown[] }
  className?: string
}) {
  if (reading.loaded && !reading.sections)
    return (
      <span className={`block text-[0.9rem] text-[#4b4a43] ${className}`}>
        {reading.lectures.length ? 'Lessons not started' : 'No lectures yet'}
      </span>
    )
  const share = reading.sections ? reading.read / reading.sections : 0
  return (
    <span
      className={`flex items-center gap-4 ${className}`}
      title={`${reading.read} of ${reading.sections} lesson sections read`}
    >
      <Bar value={share} className="flex-1" />
      <span className="w-11 text-right text-[0.95rem] text-[#33342f]">{reading.loaded ? percent(share) : '…'}</span>
    </span>
  )
}

function Done() {
  return (
    <span className="grid size-[27px] place-items-center rounded-full bg-[#1f5a34] text-[#fdf8f0]">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="m3.5 8.4 3 3 6-6.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
