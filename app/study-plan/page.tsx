'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRequiredUser } from '../components/AppShell'
import { Deadlines } from '../components/academy/Deadlines'
import { TodayPlan } from '../components/academy/TodayPlan'
import { LearnPage, Paper } from '../components/learn/LearnPage'
import { useShell } from '../components/shell/Shell'
import type { AcademySnapshot } from '../lib/academy'
import { BANNERS } from '../lib/art'
import { clockQuery } from '../lib/clock'
import { getJSON } from '../lib/supabase'

/**
 * The study plan across every course: what to do next and why (Lyceo's recommendations, from deadlines and what it
 * has seen the student do), and what's coming up. It schedules nothing it can't stand behind.
 */
export default function StudyPlanPage() {
  const user = useRequiredUser()
  const shell = useShell()
  const [snap, setSnap] = useState<AcademySnapshot | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const load = useCallback(
    () =>
      getJSON<AcademySnapshot>(`/api/academy?${clockQuery()}`).then(
        (data) => {
          setSnap(data)
          setProblem(null)
        },
        (e) => setProblem(e instanceof Error ? e.message : 'Could not load your study plan.'),
      ),
    [],
  )
  useEffect(() => {
    if (user) load()
  }, [user, load])

  if (!shell)
    return (
      <p className="p-8">
        <Link href="/dashboard">My Academy</Link>
      </p>
    )

  return (
    <LearnPage
      kicker={null}
      banner={BANNERS[0]}
      title="Your Study Plan"
      description="What to study next across your courses, and why: Lyceo weighs your deadlines and what it has seen you do. Upcoming work sits beside it."
    >
      {problem && (
        <p role="alert" className="text-terracotta">
          {problem}
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Paper title="Next for you">
          {!snap ? (
            <p className="text-ink-soft">Opening your plan</p>
          ) : snap.plan.length ? (
            <TodayPlan plan={snap.plan} />
          ) : (
            <p className="text-[0.92rem] text-ink-soft">
              Nothing to recommend yet. Add a lecture to a course and Lyceo plans what to study from it.
            </p>
          )}
        </Paper>
        <Paper>
          {snap ? (
            <Deadlines deadlines={snap.deadlines} courses={snap.courses} onChange={load} />
          ) : (
            <p className="text-ink-soft">Opening your deadlines</p>
          )}
        </Paper>
      </div>
    </LearnPage>
  )
}
