'use client'

import Link from 'next/link'
import { useState } from 'react'
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
import { addDays, shortDay } from '../lib/mastery'

// Study Plan, as designed, with what Lyceo really knows: the week on the calendar (the classes whose lectures have a
// date, and what is due), today's steps in order with the reason for each, the deadlines, how the student learns and
// where the plan's time goes. Lyceo doesn't keep study sessions with clock times yet, so the week shows days, not hours.

const DESCRIPTION = 'Organize your week and distribute study time intelligently across your courses and commitments.'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PACE = { gentle: 'Smaller steps', steady: 'Steady', brisk: 'Brisk' } as const

/** The Monday of the week holding a day, moved by whole weeks. */
function weekStart(day: string, offset: number) {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
  return addDays(day, 7 * offset - weekday)
}

export default function StudyPlanPage() {
  const shell = useShell()
  const { snapshot, problem, reload } = useSnapshot()
  const { courses, details } = useAllCourses()
  const starter = useStepStarter()
  const [offset, setOffset] = useState(0)

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
  const today = snapshot.today
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
  const start = weekStart(today, offset)
  const days = WEEKDAYS.map((name, i) => {
    const day = addDays(start, i)
    const classes = list.flatMap((c) =>
      (details[c.id]?.lectures ?? [])
        .filter((l) => l.role === 'lecture' && l.lectureDate === day)
        .map((l) => ({ course: c, lecture: l })),
    )
    return { name, day, classes, due: snapshot.deadlines.filter((d) => d.dueOn === day) }
  })
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
          }
        >
          <div className="grid min-h-[238px] grid-cols-7 divide-x divide-[#ece2d1]">
            {days.map((d) => (
              <div key={d.day} className={`min-w-0 px-1.5 pb-3 pt-2.5 ${d.day === today ? 'bg-[#f1eedb]/70' : ''}`}>
                <p className="m-0 text-center leading-tight">
                  <span className="block font-display text-[1.02rem] font-semibold text-[#1d1c19]">{d.name}</span>
                  <span
                    className={`block text-[0.8rem] ${d.day === today ? 'font-semibold text-[#1f4a2c]' : 'text-[#4b4a43]'}`}
                  >
                    {d.day === today ? 'Today' : shortDay(d.day)}
                  </span>
                </p>
                <ul className="m-0 mt-2.5 list-none space-y-1.5 p-0">
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
              'Nothing on the calendar this week. Lectures with a date and your deadlines show here.'
            )}
          </p>
        </FeatureCard>

        <Card
          icon={<CalendarIcon size={30} />}
          title="Today’s plan"
          subtitle={`Your ${plan.length} ${plan.length === 1 ? 'step' : 'steps'} for ${new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}.`}
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
