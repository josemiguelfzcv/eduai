'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { LearnPage, Paper } from '../components/learn/LearnPage'
import { useAcademy } from '../components/shell/academy'
import { useCourseArt } from '../components/shell/art'
import { StateBar, STATE_COLOR, STATE_ORDER } from '../components/learn/progress'
import { BANNERS } from '../lib/art'
import { STATE_LABEL, type SkillStateName } from '../lib/mastery'

// Progress across every course. The same evidence as each course's Knowledge Map and each assignment's progress:
// every idea is in one state, decided by the mastery policy from the student's answers. Counts, not percentages.

export default function GlobalProgressPage() {
  const academy = useAcademy()
  const art = useCourseArt()
  const loadAll = academy?.loadAll
  const courses = academy?.courses

  useEffect(() => {
    if (courses?.length) loadAll?.()
  }, [courses, loadAll])

  if (!academy)
    return (
      <p className="p-8">
        <Link href="/dashboard">My Academy</Link>
      </p>
    )

  const rows = (courses ?? []).map((course) => {
    const detail = academy.details[course.id]
    const ideas = detail?.ideas ?? []
    const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, ideas.filter((i) => i.state === s).length])) as Record<
      SkillStateName,
      number
    >
    const lectures = (detail?.lectures ?? []).filter((m) => m.role === 'lecture')
    const read = lectures.filter((l) => l.sections > 0 && l.completed >= l.sections).length
    return { course, loaded: !!detail, ideas: ideas.length, counts, lectures: lectures.length, read }
  })
  const total = Object.fromEntries(STATE_ORDER.map((s) => [s, rows.reduce((n, r) => n + r.counts[s], 0)])) as Record<
    SkillStateName,
    number
  >
  const ideas = rows.reduce((n, r) => n + r.ideas, 0)

  return (
    <LearnPage
      kicker={null}
      banner={BANNERS[2]}
      title="Global Progress"
      description="Every idea Lyceo found in your courses, in the state your answers put it in. An idea is confirmed after two right answers on different days, at least one of them a harder question."
    >
      <Paper>
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-5">
          {STATE_ORDER.map((s) => (
            <div key={s}>
              <dt className="flex items-center gap-2 text-[0.82rem] text-ink-soft">
                <span className={`size-2.5 rounded-full ${STATE_COLOR[s]}`} aria-hidden="true" />
                {STATE_LABEL[s]}
              </dt>
              <dd className="mt-0.5 font-display text-[1.7rem] font-semibold leading-tight text-[#1d1c19]">
                {total[s]}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[0.84rem] text-ink-soft">
          {ideas
            ? `${ideas} ideas across ${rows.length} ${rows.length === 1 ? 'course' : 'courses'}.`
            : 'No ideas yet.'}
        </p>
      </Paper>

      <Paper title="By course">
        {courses === null ? (
          <p className="text-ink-soft">Opening your courses</p>
        ) : !rows.length ? (
          <p className="text-[0.92rem] text-ink-soft">Add a course to see your progress in it.</p>
        ) : (
          <ul className="divide-y divide-[#efe5d5]">
            {rows.map((r) => (
              <li key={r.course.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={art.thumb(r.course.id)} alt="" className="size-12 rounded-[10px] object-cover" />
                <div className="min-w-[12rem] flex-1">
                  <Link
                    href={`/courses/${r.course.id}/knowledge-map`}
                    className="font-display text-[1.1rem] font-semibold text-[#1d1c19] no-underline hover:underline hover:underline-offset-4"
                  >
                    {r.course.code ? `${r.course.code}, ${r.course.name}` : r.course.name}
                  </Link>
                  <p className="text-[0.84rem] text-ink-soft">
                    {!r.loaded
                      ? 'Loading'
                      : `${r.counts.confirmed} of ${r.ideas} ${r.ideas === 1 ? 'idea' : 'ideas'} confirmed, ${r.read} of ${r.lectures} ${r.lectures === 1 ? 'lecture' : 'lectures'} read`}
                  </p>
                </div>
                <StateBar counts={r.counts} total={r.ideas} />
              </li>
            ))}
          </ul>
        )}
      </Paper>
    </LearnPage>
  )
}
