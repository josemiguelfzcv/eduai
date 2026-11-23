'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AddLink, LearnPage, PageNote, Paper } from '../../../components/learn/LearnPage'
import { MaterialRows } from '../../../components/learn/MaterialRows'
import { useCourseWorkspace } from '../../../components/shell/academy'
import type { MaterialRole } from '../../../lib/views'

const GROUPS: { role: MaterialRole; title: string; empty: string }[] = [
  { role: 'lecture', title: 'Lectures', empty: 'No lectures yet.' },
  { role: 'assignment', title: 'Assignments', empty: 'No assignments yet.' },
  { role: 'reading', title: 'Readings', empty: 'No readings yet.' },
  { role: 'other', title: 'Other', empty: 'Nothing else yet.' },
]

/** Everything the student added to the course, by kind, with what Lyceo found in each. */
export default function MaterialsPage() {
  const courseId = Number(useParams<{ id: string }>().id)
  const workspace = useCourseWorkspace()
  const detail = workspace?.detail ?? null
  if (!workspace) return <PageNote>This part of Lyceo isn’t available here yet.</PageNote>
  const all = detail?.lectures ?? []
  const waiting = (detail?.materials ?? []).filter((m) => m.status === 'pending' || m.status === 'failed')

  return (
    <LearnPage
      detail={detail}
      title="Materials"
      description="Everything you’ve added to this course. Each one opens as a written lesson; its ideas are what Lyceo checks you on."
      actions={<AddLink href={`/materials/new?course=${courseId}`}>Add material</AddLink>}
    >
      {!detail ? (
        <Paper>
          <p className="text-ink-soft">Opening the course</p>
        </Paper>
      ) : (
        <>
          {GROUPS.filter((g) => g.role === 'lecture' || all.some((m) => m.role === g.role)).map((g) => (
            <Paper key={g.role} title={g.title}>
              <MaterialRows
                items={all.filter((m) => m.role === g.role)}
                courseId={courseId}
                numbered={g.role === 'lecture'}
                order={all.map((m) => m.id)}
                onChanged={workspace.reload}
                empty={g.empty}
              />
            </Paper>
          ))}
          {waiting.length > 0 && (
            <Paper title="Not ready">
              <ul className="divide-y divide-[#efe5d5]">
                {waiting.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <Link href={`/materials/${m.id}`} className="font-display text-[1.05rem] text-[#1d1c19]">
                      {m.title}
                    </Link>
                    <span className="text-[0.84rem] text-ink-soft">
                      {m.status === 'failed' ? (m.failure ?? 'Couldn’t be read') : 'Still uploading'}
                    </span>
                  </li>
                ))}
              </ul>
            </Paper>
          )}
        </>
      )}
    </LearnPage>
  )
}
