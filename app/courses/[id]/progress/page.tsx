'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { LearnPage, PageNote, Paper, PILL_PRIMARY, PILL_SECONDARY } from '../../../components/learn/LearnPage'
import { useCourseWorkspace } from '../../../components/learn/workspace'
import { StateChip } from '../../../components/study/Closure'
import { startQuickCheck } from '../../../components/study/client'

/** What Lyceo has seen the student do in the course: lectures read, and each idea's state with what's next. */
export default function ProgressPage() {
  const courseId = Number(useParams<{ id: string }>().id)
  const router = useRouter()
  const workspace = useCourseWorkspace()
  const detail = workspace?.detail ?? null
  const [starting, setStarting] = useState<'quick_check' | 'guided_review' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  if (!workspace) return <PageNote>This part of Lyceo isn’t available here yet.</PageNote>

  const lectures = (detail?.lectures ?? []).filter((m) => m.role === 'lecture')
  const read = lectures.filter((l) => l.sections > 0 && l.completed >= l.sections).length
  const ideas = detail?.ideas ?? []
  const confirmed = ideas.filter((i) => i.state === 'confirmed').length
  const toPractice = ideas.filter((i) => i.state !== 'confirmed').length

  const start = async (mode: 'quick_check' | 'guided_review') => {
    setStarting(mode)
    setProblem(null)
    try {
      router.push(`/sessions/${await startQuickCheck({ courseId, mode })}`)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not start the session.')
      setStarting(null)
    }
  }

  return (
    <LearnPage
      detail={detail}
      title="Progress"
      description="What Lyceo has seen you do in this course. An idea is confirmed after two right answers on different days, at least one of them a harder question."
      actions={
        toPractice > 0 ? (
          <>
            <button
              type="button"
              className={PILL_SECONDARY}
              disabled={starting !== null}
              onClick={() => start('guided_review')}
            >
              {starting === 'guided_review' ? 'Writing the review' : 'Guided Review'}
            </button>
            <button
              type="button"
              className={PILL_PRIMARY}
              disabled={starting !== null}
              onClick={() => start('quick_check')}
            >
              {starting === 'quick_check' ? 'Writing questions' : 'Quick Check'}
            </button>
          </>
        ) : undefined
      }
    >
      {problem && (
        <p role="alert" className="px-4 text-terracotta">
          {problem}
        </p>
      )}
      {!detail ? (
        <Paper>
          <p className="text-ink-soft">Opening the course</p>
        </Paper>
      ) : (
        <>
          <Paper>
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Stat label="Lectures read" value={`${read} of ${lectures.length}`} />
              <Stat label="Ideas confirmed" value={`${confirmed} of ${ideas.length}`} />
              <Stat label="To practice" value={String(toPractice)} />
            </dl>
          </Paper>
          <Paper title="Ideas">
            {ideas.length ? (
              <ul className="divide-y divide-[#efe5d5]">
                {ideas.map((idea) => (
                  <li key={idea.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-display text-[1.05rem] font-medium text-[#1d1c19]">{idea.name}</span>
                      <StateChip state={idea.state} label={idea.label} />
                    </div>
                    <p className="mt-1 text-[0.86rem] text-ink-soft">
                      {idea.next ? `${idea.reason} ${idea.next}` : idea.reason}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.92rem] text-ink-soft">
                Ideas show up here once Lyceo has read a lecture of this course.
              </p>
            )}
          </Paper>
        </>
      )}
    </LearnPage>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.82rem] text-ink-soft">{label}</dt>
      <dd className="mt-0.5 font-display text-[1.6rem] font-semibold leading-tight text-[#1d1c19]">{value}</dd>
    </div>
  )
}
