'use client'

import Link from 'next/link'
import {
  Bar,
  Card,
  courseTitle,
  Donut,
  EmptyNote,
  FeatureCard,
  ModulePage,
  percent,
  Ring,
  Stat,
  StatStrip,
  Tag,
  TrendChart,
  useStepStarter,
  Waiting,
  type TagTone,
} from '../components/academy/board'
import {
  AlertIcon,
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  LayersIcon,
  TargetIcon,
  TrendIcon,
} from '../components/learn/icons'
import { STATE_HEX, STATE_ORDER } from '../components/learn/progress'
import { useAcademy, useAllCourses, useSnapshot } from '../components/shell/academy'
import { CourseGlyph } from '../components/shell/glyph'
import { localToday } from '../lib/academy'
import { addDays, shortDay, STATE_LABEL, type SkillStateName } from '../lib/mastery'

// Global Progress, as designed: what the student has proven they know, across every course. The same evidence as each
// course's Knowledge Map: every concept is in one state, decided by the mastery policy from the student's answers
// (confirmed after two right answers on different days, one of them harder). "Mastery" here is the share confirmed.

type Counts = Record<SkillStateName, number>
const count = (states: SkillStateName[]): Counts =>
  Object.fromEntries(STATE_ORDER.map((s) => [s, states.filter((x) => x === s).length])) as Counts

/** A course's standing in a word, from the states of its concepts. */
function standing(c: Counts, total: number): { text: string; tone: TagTone } {
  if (!total) return { text: 'No concepts yet', tone: 'stone' }
  if (c.needs_practice) return { text: 'Needs practice', tone: 'clay' }
  if (c.review) return { text: 'Review due', tone: 'gold' }
  if (c.confirmed === total) return { text: 'Strong', tone: 'amber' }
  if (c.confirmed || c.learning) return { text: 'Learning', tone: 'sage' }
  return { text: 'Not started', tone: 'stone' }
}

export default function GlobalProgressPage() {
  const academy = useAcademy()
  const { courses, details } = useAllCourses()
  const { snapshot } = useSnapshot()
  const starter = useStepStarter()

  if (!academy)
    return (
      <p className="p-8">
        <Link href="/dashboard">My Academy</Link>
      </p>
    )

  const list = courses ?? []
  const loaded = courses !== null && list.every((c) => details[c.id])
  const rows = list.map((course) => {
    const ideas = details[course.id]?.ideas ?? []
    return { course, loaded: !!details[course.id], ideas, counts: count(ideas.map((i) => i.state)) }
  })
  const concepts = rows.flatMap((r) => r.ideas.map((idea) => ({ idea, course: r.course })))
  const total = concepts.length
  const counts = count(concepts.map((c) => c.idea.state))
  const attention = concepts
    .filter((c) => c.idea.state === 'needs_practice' || c.idea.state === 'review')
    .sort((a, b) => Number(b.idea.state === 'needs_practice') - Number(a.idea.state === 'needs_practice'))
  const gains = concepts
    .filter((c) => c.idea.confirmedOn)
    .sort((a, b) => b.idea.confirmedOn!.localeCompare(a.idea.confirmedOn!))
    .slice(0, 3)
  const today = snapshot?.today ?? rows.map((r) => details[r.course.id]?.today).find(Boolean) ?? localToday()
  // Concepts confirmed by the end of each of the last six weeks.
  const weeks = [5, 4, 3, 2, 1, 0].map((ago) => {
    const day = addDays(today, -7 * ago)
    return {
      label: shortDay(day),
      value: concepts.filter((c) => c.idea.confirmedOn && c.idea.confirmedOn <= day).length,
    }
  })

  return (
    <ModulePage
      title="Global Progress"
      description="Understand your overall learning across all courses, see what you’ve mastered, and find the best areas to focus on next."
    >
      <StatStrip>
        <Stat
          icon={<Ring value={total ? counts.confirmed / total : 0} />}
          value={loaded ? percent(total ? counts.confirmed / total : 0) : '…'}
          label="Overall mastery"
          title={`${counts.confirmed} of ${total} concepts confirmed`}
        />
        <Stat
          icon={<LayersIcon size={34} />}
          value={`${list.length} active ${list.length === 1 ? 'course' : 'courses'}`}
          label="This term"
        />
        <Stat
          icon={<CheckCircleIcon size={34} />}
          value={`${counts.confirmed} ${counts.confirmed === 1 ? 'concept' : 'concepts'}`}
          label="Confirmed"
        />
        <Stat
          icon={<AlertIcon size={34} />}
          value={`${attention.length} ${attention.length === 1 ? 'area' : 'areas'}`}
          label="Need review"
          title="Concepts to practice again or due for a review"
        />
      </StatStrip>

      <div className="grid grid-cols-[minmax(0,1.07fr)_minmax(0,1fr)] items-stretch gap-[22px]">
        <FeatureCard
          icon={<BookIcon size={30} />}
          title="Progress by course"
          subtitle="Concepts confirmed in each of your active courses."
        >
          {courses === null ? (
            <div className="px-5 py-4">
              <Waiting />
            </div>
          ) : !rows.length ? (
            <div className="px-5 py-4">
              <EmptyNote>Add a course to see your progress in it.</EmptyNote>
            </div>
          ) : (
            <ul className="m-0 list-none divide-y divide-[#ece2d1] p-0 px-4 py-1">
              {rows.map((r) => {
                const all = r.ideas.length
                const state = standing(r.counts, all)
                return (
                  <li key={r.course.id}>
                    <Link
                      href={`/courses/${r.course.id}/knowledge-map`}
                      title={`${r.counts.confirmed} of ${all} concepts confirmed`}
                      className="flex items-center gap-3.5 py-[9px] text-ink no-underline"
                    >
                      <CourseGlyph course={r.course} size={40} />
                      <span className="w-[7.4rem] min-w-0 shrink-0">
                        <span className="block truncate text-[1.02rem] font-medium leading-[1.3]">
                          {courseTitle(r.course)}
                        </span>
                        {r.course.code && (
                          <span className="block truncate text-[0.88rem] leading-[1.3] text-[#4b4a43]">
                            {r.course.name}
                          </span>
                        )}
                      </span>
                      <Bar value={all ? r.counts.confirmed / all : 0} className="flex-1" />
                      <span className="w-11 text-right text-[0.98rem]">
                        {r.loaded ? percent(all ? r.counts.confirmed / all : 0) : '…'}
                      </span>
                      <span className="flex w-[108px] shrink-0 justify-end">
                        {r.loaded && <Tag tone={state.tone}>{state.text}</Tag>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </FeatureCard>

        <Card
          icon={<TrendIcon size={30} />}
          title="Learning momentum"
          subtitle="Concepts confirmed across all courses, week by week."
        >
          {!loaded ? (
            <Waiting lines={4} />
          ) : total ? (
            <TrendChart points={weeks} max={total} unit="concepts confirmed" />
          ) : (
            <EmptyNote>
              Once your lectures are mapped into concepts and you answer Quick Checks, your confirmed concepts chart
              here.
            </EmptyNote>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-[22px]">
        <Card
          icon={<TargetIcon size={30} />}
          title="Concept status"
          subtitle={`Across all courses (${total} total ${total === 1 ? 'concept' : 'concepts'}).`}
        >
          {!loaded ? (
            <Waiting />
          ) : (
            <div className="flex items-center gap-5">
              <Donut
                total={total}
                unit={total === 1 ? 'Concept' : 'Concepts'}
                segments={STATE_ORDER.map((s) => ({
                  key: s,
                  label: STATE_LABEL[s],
                  value: counts[s],
                  color: STATE_HEX[s],
                }))}
              />
              <ul className="m-0 min-w-0 flex-1 list-none divide-y divide-[#ece2d1] p-0">
                {STATE_ORDER.map((s) => (
                  <li
                    key={s}
                    title={
                      total ? `${STATE_LABEL[s]}: ${counts[s]} of ${total} (${percent(counts[s] / total)})` : undefined
                    }
                    className="flex items-center gap-2.5 py-[7px] text-[0.9rem] leading-[1.25]"
                  >
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-[3px]"
                      style={{ background: STATE_HEX[s] }}
                    />
                    <span className="min-w-0 flex-1">{STATE_LABEL[s]}</span>
                    <span className="shrink-0 text-[#33342f]">
                      {counts[s]}
                      {total > 0 && <span className="hidden min-[1600px]:inline"> ({percent(counts[s] / total)})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card icon={<BookIcon size={30} />} title="Recent gains" subtitle="Concepts you’ve newly confirmed.">
          {!loaded ? (
            <Waiting />
          ) : gains.length ? (
            <ul className="m-0 list-none divide-y divide-[#ece2d1] p-0">
              {gains.map(({ idea, course }) => (
                <li key={idea.id} className="flex items-center gap-4 py-[8px] first:pt-0">
                  <span
                    aria-hidden="true"
                    className="grid size-[27px] shrink-0 place-items-center rounded-full bg-[#1f5a34] text-[#fdf8f0]"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="m3.5 8.4 3 3 6-6.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.98rem] font-medium leading-[1.3]" title={idea.name}>
                      {idea.name}
                    </span>
                    <span className="block truncate text-[0.88rem] leading-[1.35] text-[#4b4a43]">
                      {courseTitle(course)} · Confirmed {shortDay(idea.confirmedOn!)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>
              A concept is confirmed after two right answers on different days. The first ones will show here.
            </EmptyNote>
          )}
        </Card>

        <Card icon={<AlertIcon size={30} />} title="Needs attention" subtitle="Concepts to practice again or review.">
          {!loaded ? (
            <Waiting />
          ) : attention.length ? (
            <ul className="m-0 list-none divide-y divide-[#ece2d1] p-0">
              {attention.slice(0, 3).map(({ idea, course }) => (
                <li key={idea.id} className="flex items-center gap-3 py-[8px] first:pt-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.98rem] font-medium leading-[1.3]" title={idea.name}>
                      {idea.name}
                    </span>
                    <span className="block truncate text-[0.88rem] leading-[1.35] text-[#4b4a43]">
                      {courseTitle(course)} · {idea.reason}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => starter.check(`idea-${idea.id}`, course.id, [idea.id])}
                    disabled={starter.busy !== null}
                    className="shrink-0 rounded-[8px] bg-[#f6e8c6] px-3 py-[5px] text-[0.84rem] font-medium text-[#6b4a12] transition-colors hover:bg-[#f1dca9] disabled:opacity-60"
                  >
                    {starter.busy === `idea-${idea.id}` ? 'Writing' : idea.state === 'review' ? 'Review' : 'Practice'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>Nothing needs another look right now.</EmptyNote>
          )}
        </Card>
      </div>

      <Card
        icon={<CalendarIcon size={30} />}
        title="Recommended next reviews"
        subtitle="Revisit these concepts to build mastery and close your biggest gaps."
        className="!flex-row items-center gap-6 [&>div:last-child]:mt-0 [&>header]:w-[38%] [&>header]:shrink-0"
      >
        {!loaded ? (
          <Waiting lines={1} />
        ) : attention.length ? (
          <div className="flex flex-wrap items-center gap-2.5 border-l border-[#e6dccb] pl-6">
            {attention.slice(0, 5).map(({ idea, course }) => (
              <button
                key={idea.id}
                type="button"
                title={`${courseTitle(course)}: start a Quick Check on this concept`}
                onClick={() => starter.check(`chip-${idea.id}`, course.id, [idea.id])}
                disabled={starter.busy !== null}
                className="max-w-[17rem] truncate rounded-[9px] bg-[#e9ead6] px-3.5 py-[7px] text-[0.9rem] font-medium text-[#1f3a24] transition-colors hover:bg-[#dfe2c6] disabled:opacity-60"
              >
                {starter.busy === `chip-${idea.id}` ? 'Writing your questions' : idea.name}
              </button>
            ))}
            {attention.length > 5 && (
              <span className="text-[0.9rem] text-[#4b4a43]">and {attention.length - 5} more</span>
            )}
          </div>
        ) : (
          <p className="m-0 border-l border-[#e6dccb] pl-6 text-[0.95rem] text-[#4b4a43]">
            No reviews are due. Lyceo recommends one when a confirmed concept has rested long enough.
          </p>
        )}
        {starter.error && (
          <p role="alert" className="m-0 mt-2 text-[0.9rem] text-terracotta">
            {starter.error}
          </p>
        )}
      </Card>
    </ModulePage>
  )
}
