'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Bar,
  Card,
  courseHues,
  courseTitle,
  EmptyNote,
  FeatureCard,
  KIND_VERB,
  minutesLabel,
  ModulePage,
  percent,
  Stat,
  StatStrip,
  StepIcon,
  StepTrigger,
  Tag,
  useStepStarter,
  Waiting,
} from '../components/academy/board'
import {
  busyOnDay,
  CalendarBanner,
  CalendarControl,
  timeRange,
  useCalendar,
  usePlacedSteps,
} from '../components/academy/calendar'
import { Deadlines } from '../components/academy/Deadlines'
import { kindLabel } from '../components/academy/format'
import {
  ActivityIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CapIcon,
  ClockIcon,
  LayersIcon,
  RepeatIcon,
  TargetIcon,
} from '../components/learn/icons'
import { useAllCourses, useSnapshot } from '../components/shell/academy'
import { CourseGlyph } from '../components/shell/glyph'
import { useShell } from '../components/shell/Shell'
import { lectureHref } from '../components/shell/Sidebar'
import type { AcademyCourse } from '../lib/academy'
import type { PlanStep } from '../lib/calendar'
import { addDays, shortDay } from '../lib/mastery'

// Study Plan, as designed, with what Lyceo really knows: the week on the calendar (the classes whose lectures have a
// date, and what is due), today's steps in order with the reason for each, the deadlines, how the student learns and
// where the plan's time goes. With Google Calendar connected, the week also shows when the student is busy, and
// today's steps get times in their free time, which they can put on their calendar.

const DESCRIPTION = 'Organize your week and distribute study time intelligently across your courses and commitments.'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PACE = { gentle: 'Smaller steps', steady: 'Steady', brisk: 'Brisk' } as const
const SMALL_BUTTON =
  'shrink-0 rounded-[8px] bg-[#1f4a2c] px-3.5 py-[6px] text-[0.84rem] font-medium text-ivory transition-colors hover:bg-[#173d22] disabled:opacity-60'

/** The Monday of the week holding a day, moved by whole weeks. */
function weekStart(day: string, offset: number) {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
  return addDays(day, 7 * offset - weekday)
}

/** The days whose busy times the page needs: the week shown and, when it's near, today (for today's plan). */
function calendarDays(today: string | null, start: string | null) {
  if (!today || !start) return null
  const end = addDays(start, 7)
  const from = today < start ? today : start
  const to = today >= end ? addDays(today, 1) : end
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  return span <= 14 ? { from, to } : { from: start, to: end }
}

export default function StudyPlanPage() {
  const shell = useShell()
  const { snapshot, problem, reload } = useSnapshot()
  const { courses, details } = useAllCourses()
  const starter = useStepStarter()
  const [offset, setOffset] = useState(0)
  const today = snapshot?.today ?? null
  const shownStart = today ? weekStart(today, offset) : null
  const calendar = useCalendar(useMemo(() => calendarDays(today, shownStart), [today, shownStart]))
  const steps = useMemo<PlanStep[]>(() => {
    const known = courses ?? snapshot?.courses ?? []
    return (snapshot?.plan ?? []).map((a) => {
      const c = known.find((k) => k.id === a.courseId)
      return { key: a.key, title: a.title, minutes: a.minutes, course: c ? courseTitle(c) : a.courseName }
    })
  }, [snapshot, courses])
  const placed = usePlacedSteps(calendar, today ?? '', steps)
  const [added, setAdded] = useState<string | null>(null)

  if (!shell)
    return (
      <p className="p-8">
        <Link href="/dashboard">My Academy</Link>
      </p>
    )

  if (!snapshot)
    return (
      <ModulePage title="Study Plan" description={DESCRIPTION}>
        <Card title={problem ? 'Your study plan couldn’t open' : 'Opening your study plan'}>
          {problem ? (
            <>
              <p role="alert" className="m-0 text-[#4b4a43]">
                {problem.message}
              </p>
              <button type="button" className="btn btn-quiet mt-4" onClick={reload}>
                Try again
              </button>
            </>
          ) : (
            <Waiting lines={4} />
          )}
        </Card>
      </ModulePage>
    )

  const list: AcademyCourse[] = courses ?? snapshot.courses
  const thisDay = snapshot.today
  const hue = courseHues(list)
  const course = (id: number | null) => list.find((c) => c.id === id) ?? null
  const codeOf = (id: number | null, fallback: string | null) => {
    const found = course(id)
    return found ? courseTitle(found) : fallback
  }
  const loaded = list.every((c) => details[c.id])

  const plan = snapshot.plan
  const minutes = plan.reduce((n, a) => n + a.minutes, 0)
  const upcoming = snapshot.deadlines.filter((d) => !d.completedAt && d.daysLeft >= 0)
  const exams = upcoming.filter((d) => d.kind === 'exam')
  const toReview = list.reduce(
    (n, c) =>
      n + (details[c.id]?.ideas ?? []).filter((i) => i.state === 'review' || i.state === 'needs_practice').length,
    0,
  )

  // The week on the calendar: classes (lectures with a date) and what is due, day by day.
  const start = weekStart(thisDay, offset)
  const days = WEEKDAYS.map((name, i) => {
    const day = addDays(start, i)
    const classes = list.flatMap((c) =>
      (details[c.id]?.lectures ?? [])
        .filter((l) => l.role === 'lecture' && l.lectureDate === day)
        .map((l) => ({ course: c, lecture: l })),
    )
    return { name, day, classes, due: snapshot.deadlines.filter((d) => d.dueOn === day) }
  })
  const timeOf = new Map(
    (placed?.sessions ?? []).flatMap((session) =>
      session.steps.map((t) => [t.key, timeRange(Date.parse(t.start), Date.parse(t.end), calendar.timeZone)] as const),
    ),
  )
  const placedKey = placed?.sessions.map((session) => `${session.start}/${session.end}`).join('|') ?? ''
  const busyByDay = Object.fromEntries(
    days.map((d) => [d.day, busyOnDay(calendar.busy, d.day, addDays(d.day, 1), calendar.timeZone)]),
  )
  /** A day's busy times (at most four shown) and, today, the study sessions placed between them, in time order. */
  const timesOn = (day: string) => {
    const busy = busyByDay[day] ?? []
    return [
      ...busy
        .slice(0, busy.length > 4 ? 3 : 4)
        .map((b) => ({ study: false, start: b.start, label: b.label, title: '' })),
      ...(day === thisDay ? (placed?.sessions ?? []) : []).map((session) => ({
        study: true,
        start: Date.parse(session.start),
        label: timeRange(Date.parse(session.start), Date.parse(session.end), calendar.timeZone),
        title: session.steps.map((t) => t.title).join(' · '),
      })),
    ].sort((a, b) => a.start - b.start)
  }
  const weekClasses = days.flatMap((d) => d.classes)
  const weekDue = days.flatMap((d) => d.due)

  // Where the plan's time goes.
  const load = list
    .map((c) => ({ course: c, minutes: plan.filter((a) => a.courseId === c.id).reduce((n, a) => n + a.minutes, 0) }))
    .filter((w) => w.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
  const heaviest = Math.max(1, ...load.map((w) => w.minutes))
  const learner = snapshot.learner

  return (
    <ModulePage title="Study Plan" description={DESCRIPTION}>
      <CalendarBanner calendar={calendar} />
      <StatStrip>
        <Stat icon={<ClockIcon size={34} />} value={minutesLabel(minutes)} label="In your plan" />
        <Stat
          icon={<CalendarIcon size={34} />}
          value={`${plan.length} ${plan.length === 1 ? 'step' : 'steps'}`}
          label="Today"
        />
        <Stat
          icon={<CapIcon size={36} />}
          value={`${exams.length} ${exams.length === 1 ? 'exam' : 'exams'}`}
          label="Coming up"
          title={exams.map((e) => `${e.title}, ${shortDay(e.dueOn)}`).join(' · ') || undefined}
        />
        <Stat
          icon={<RepeatIcon size={32} />}
          value={loaded ? `${toReview} ${toReview === 1 ? 'concept' : 'concepts'}` : '…'}
          label="To review"
          title="Concepts to practice again or due for a review"
        />
      </StatStrip>

      <div className="grid grid-cols-[minmax(0,1.78fr)_minmax(0,1fr)] items-stretch gap-[22px]">
        <FeatureCard
          icon={<CalendarIcon size={30} />}
          title="Your week"
          subtitle="Classes and deadlines on your calendar."
          action={
            <div className="flex items-center gap-2">
              <CalendarControl calendar={calendar} />
              <div className="flex items-center gap-1 rounded-[10px] border border-ivory/35 px-1 py-[3px] text-[0.9rem] text-ivory">
                <button
                  type="button"
                  onClick={() => setOffset((n) => n - 1)}
                  aria-label="The week before"
                  className="grid size-7 place-items-center rounded-md hover:bg-ivory/[0.12]"
                >
                  <ArrowLeftIcon size={16} />
                </button>
                <span className="min-w-[8.2rem] text-center">
                  {shortDay(start)} – {shortDay(addDays(start, 6))}
                </span>
                <button
                  type="button"
                  onClick={() => setOffset((n) => n + 1)}
                  aria-label="The week after"
                  className="grid size-7 place-items-center rounded-md hover:bg-ivory/[0.12]"
                >
                  <ArrowRightIcon size={16} />
                </button>
              </div>
            </div>
          }
        >
          <div className="grid min-h-[238px] grid-cols-7 divide-x divide-[#ece2d1]">
            {days.map((d) => (
              <div key={d.day} className={`min-w-0 px-1.5 pb-3 pt-2.5 ${d.day === thisDay ? 'bg-[#f1eedb]/70' : ''}`}>
                <p className="m-0 text-center leading-tight">
                  <span className="block font-display text-[1.02rem] font-semibold text-[#1d1c19]">{d.name}</span>
                  <span
                    className={`block text-[0.8rem] ${d.day === thisDay ? 'font-semibold text-[#1f4a2c]' : 'text-[#4b4a43]'}`}
                  >
                    {d.day === thisDay ? 'Today' : shortDay(d.day)}
                  </span>
                </p>
                <ul className="m-0 mt-2.5 list-none space-y-1.5 p-0">
                  {timesOn(d.day).map((slot) =>
                    slot.study ? (
                      <li
                        key={`study-${slot.start}`}
                        title={slot.title}
                        className="rounded-[7px] border-l-[3px] border-[#1f6d38] bg-[#e4efe0] px-1.5 py-[5px] text-[0.76rem] leading-[1.25] text-[#173d22]"
                      >
                        <span className="block font-semibold">Study</span>
                        <span className="block">{slot.label}</span>
                      </li>
                    ) : (
                      <li
                        key={`busy-${slot.start}`}
                        title={`Busy ${slot.label}`}
                        className="rounded-[7px] bg-[#ece6db] px-1.5 py-[4px] text-[0.74rem] leading-[1.25] text-[#4b4a43]"
                      >
                        <span className="sr-only">Busy </span>
                        {slot.label}
                      </li>
                    ),
                  )}
                  {(busyByDay[d.day]?.length ?? 0) > 4 && (
                    <li className="px-1.5 text-[0.74rem] text-[#5b5a52]">+{busyByDay[d.day].length - 3} more busy</li>
                  )}
                  {d.classes.map(({ course: c, lecture }) => (
                    <li key={lecture.id}>
                      <Link
                        href={lectureHref(c.id, lecture)}
                        title={`${courseTitle(c)}: ${lecture.title}`}
                        className="block rounded-[7px] border-l-[3px] px-1.5 py-[5px] text-[0.76rem] leading-[1.25] text-[#1d1c19] no-underline"
                        style={{
                          borderColor: hue(c.id),
                          background: `color-mix(in srgb, ${hue(c.id)} 14%, #fdf8f0)`,
                        }}
                      >
                        <span className="block truncate font-semibold">{courseTitle(c)}</span>
                        <span className="line-clamp-2 break-words">{lecture.title}</span>
                      </Link>
                    </li>
                  ))}
                  {d.due.map((deadline) => (
                    <li
                      key={`due-${deadline.id}`}
                      title={`${deadline.title}, ${codeOf(deadline.courseId, deadline.courseName)}`}
                      className={`rounded-[7px] border border-dashed border-[#c9a44f] bg-[#fbf1d6] px-1.5 py-[5px] text-[0.76rem] leading-[1.25] text-[#4d3708] ${deadline.completedAt ? 'opacity-60' : ''}`}
                    >
                      <span className="block truncate font-semibold">
                        {deadline.completedAt ? 'Done' : 'Due'} · {kindLabel(deadline.kind)}
                      </span>
                      <span className="line-clamp-2 break-words">{deadline.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="m-0 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[#ece2d1] px-4 py-2.5 text-[0.84rem] text-[#33342f]">
            {!loaded ? (
              'Opening your courses'
            ) : weekClasses.length || weekDue.length ? (
              <>
                {list
                  .filter((c) => weekClasses.some((w) => w.course.id === c.id))
                  .map((c) => {
                    const n = weekClasses.filter((w) => w.course.id === c.id).length
                    return (
                      <span key={c.id} className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: hue(c.id) }} aria-hidden="true" />
                        {courseTitle(c)}{' '}
                        <span className="text-[#5b5a52]">
                          ({n} {n === 1 ? 'class' : 'classes'})
                        </span>
                      </span>
                    )
                  })}
                <span className="ml-auto font-medium">
                  {weekDue.length} {weekDue.length === 1 ? 'deadline' : 'deadlines'} this week
                </span>
              </>
            ) : (
              'No classes or deadlines this week. Lectures with a date and your deadlines show here.'
            )}
            {calendar.busy && (
              <span className="inline-flex items-center gap-2 text-[#5b5a52]">
                <span className="h-2.5 w-4 rounded-sm bg-[#ece6db]" aria-hidden="true" />
                Busy, from Google Calendar
              </span>
            )}
            {calendar.busyProblem && (
              <span role="alert" className="text-terracotta">
                {calendar.busyProblem}
              </span>
            )}
          </p>
        </FeatureCard>

        <Card
          icon={<CalendarIcon size={30} />}
          title="Today’s plan"
          subtitle={`Your ${plan.length} ${plan.length === 1 ? 'step' : 'steps'} for ${new Date(`${thisDay}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}.`}
        >
          {plan.length ? (
            <ol className="m-0 list-none divide-y divide-[#ece2d1] p-0">
              {plan.map((a, i) => (
                <li key={a.key}>
                  <StepTrigger
                    action={a}
                    starter={starter}
                    className="flex w-full items-center gap-3 py-[9px] text-left text-ink no-underline disabled:opacity-70"
                  >
                    <span className="grid h-8 w-[42px] shrink-0 place-items-center rounded-[8px] bg-[#f3eadc] font-display text-[1.02rem] font-medium">
                      {i + 1}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-9 w-[3px] shrink-0 rounded-full"
                      style={{ background: hue(a.courseId) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[0.96rem] font-medium leading-[1.3]" title={a.title}>
                        {a.title}
                      </span>
                      <span className="block truncate text-[0.86rem] leading-[1.35] text-[#4b4a43]">
                        {starter.busy === a.key ? 'Writing your questions' : codeOf(a.courseId, a.courseName)}
                        {starter.busy !== a.key && timeOf.get(a.key) && (
                          <span className="font-medium text-[#1f4a2c]"> · {timeOf.get(a.key)}</span>
                        )}
                      </span>
                    </span>
                    <Tag tone="stone">{a.minutes} min</Tag>
                  </StepTrigger>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyNote>Nothing is planned for today. Add a lecture or a deadline and Lyceo plans from it.</EmptyNote>
          )}
          {calendar.status?.configured && plan.length > 0 && (
            <div className="mt-3 flex items-center gap-4 border-t border-[#ece2d1] pt-3 text-[0.88rem] leading-snug text-[#4b4a43]">
              {!calendar.live ? (
                <>
                  <span className="min-w-0 flex-1">
                    {calendar.status.expired
                      ? 'Your Google Calendar connection expired. Reconnect it and Lyceo fits these steps into your free time.'
                      : 'Connect Google Calendar and Lyceo fits these steps into your free time.'}
                  </span>
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    onClick={calendar.connect}
                    disabled={calendar.working === 'connect'}
                  >
                    {calendar.working === 'connect'
                      ? 'Opening Google'
                      : calendar.status.expired
                        ? 'Reconnect'
                        : 'Connect'}
                  </button>
                </>
              ) : !calendar.status.canSeeBusy ? (
                <span>Lyceo can’t see when you’re busy. Disconnect and connect again, allowing both options.</span>
              ) : !placed ? (
                <span>{calendar.busyProblem ?? 'Reading your calendar'}</span>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    {placed.sessions.length
                      ? `${placed.sessions.length} ${placed.sessions.length === 1 ? 'session' : 'sessions'} in your free time, between 8 AM and 10 PM.`
                      : 'No free time left today between 8 AM and 10 PM.'}
                    {placed.unplaced.length > 0 &&
                      ` ${placed.unplaced.length} ${placed.unplaced.length === 1 ? 'step doesn’t' : 'steps don’t'} fit today.`}
                  </span>
                  {calendar.status.canWrite && placed.sessions.length > 0 && (
                    <button
                      type="button"
                      className={SMALL_BUTTON}
                      disabled={calendar.working === 'sessions' || added === placedKey}
                      onClick={async () => {
                        if (await calendar.addSessions(thisDay, placed.sessions)) setAdded(placedKey)
                      }}
                    >
                      {calendar.working === 'sessions'
                        ? 'Adding'
                        : added === placedKey
                          ? 'On your calendar'
                          : 'Add to Google Calendar'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 items-start gap-[22px]">
        <Card
          icon={<TargetIcon size={30} />}
          title="Why these steps"
          subtitle="The reason behind each one, from your deadlines and your answers."
        >
          {plan.length ? (
            <ul className="m-0 list-none space-y-2 p-0">
              {plan.slice(0, 4).map((a) => (
                <li
                  key={a.key}
                  className="flex items-center gap-4 rounded-[12px] border border-[#ece2d1] bg-[#fefbf5] px-4 py-[9px]"
                >
                  <span className="shrink-0 text-[#1f4a2c]" aria-hidden="true">
                    <StepIcon kind={a.kind} size={25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.96rem] font-semibold leading-[1.3]" title={a.title}>
                      {a.title}
                    </span>
                    <span className="block text-[0.86rem] leading-[1.35] text-[#33342f]">{a.why}</span>
                  </span>
                  <StepTrigger
                    action={a}
                    starter={starter}
                    className="shrink-0 rounded-[8px] bg-[#f6e8c6] px-3.5 py-[5px] text-[0.84rem] font-medium text-[#6b4a12] no-underline transition-colors hover:bg-[#f1dca9] disabled:opacity-60"
                  >
                    {starter.busy === a.key ? 'Writing' : KIND_VERB[a.kind]}
                  </StepTrigger>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>When Lyceo recommends a step, it says why here.</EmptyNote>
          )}
          {starter.error && (
            <p role="alert" className="mb-0 mt-2 text-[0.9rem] text-terracotta">
              {starter.error}
            </p>
          )}
        </Card>

        <Card icon={<CalendarIcon size={30} />} title="Upcoming deadlines" subtitle="Across all courses.">
          <Deadlines deadlines={snapshot.deadlines} courses={list} onChange={reload} heading={false} />
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1.38fr)_minmax(0,1fr)] items-start gap-[22px]">
        <Card icon={<ActivityIcon size={30} />} title="How you learn" subtitle="What your own answers show so far.">
          {learner.answers ? (
            <dl className="m-0 grid grid-cols-4 gap-5">
              {[
                [
                  'Right on the first try',
                  learner.firstTryAccuracy === null ? 'Not yet' : percent(learner.firstTryAccuracy),
                ],
                ['Concepts checked', String(learner.conceptsSeen)],
                ['Pace', PACE[learner.pace]],
                [
                  'A typical answer takes',
                  learner.avgSecondsToAnswer === null ? 'Not yet' : `${Math.round(learner.avgSecondsToAnswer)} s`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.86rem] leading-[1.3] text-[#4b4a43]">{label}</dt>
                  <dd className="m-0 mt-1 font-display text-[1.5rem] font-semibold leading-tight text-[#1d1c19]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyNote>
              Answer a few questions in a lesson or a Quick Check and Lyceo starts to see how you learn.
            </EmptyNote>
          )}
          <p className="mb-0 mt-4 text-[0.88rem] text-[#4b4a43]">
            Lyceo paces and words its lessons from this.{' '}
            <Link href="/profile" className="text-[#1f4a2c] underline underline-offset-4">
              Set how you like to learn
            </Link>
          </p>
        </Card>

        <Card
          icon={<LayersIcon size={30} />}
          title="Workload by course"
          subtitle={`Time in your plan (${minutesLabel(minutes)}).`}
        >
          {load.length ? (
            <ul className="m-0 list-none space-y-3 p-0">
              {load.map((w) => (
                <li key={w.course.id} className="flex items-center gap-3.5">
                  <CourseGlyph course={w.course} size={34} />
                  <span className="w-[5.6rem] shrink-0 truncate text-[0.98rem] font-medium">
                    {courseTitle(w.course)}
                  </span>
                  <Bar value={w.minutes / heaviest} className="flex-1" />
                  <span className="w-[4.2rem] shrink-0 text-right text-[0.94rem] text-[#33342f]">
                    {minutesLabel(w.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>No time is planned yet.</EmptyNote>
          )}
        </Card>
      </div>
    </ModulePage>
  )
}
