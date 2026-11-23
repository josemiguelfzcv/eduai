'use client'

import { useParams } from 'next/navigation'
import { AddLink, LearnPage, PageNote, Paper } from '../../../components/learn/LearnPage'
import { MaterialRows } from '../../../components/learn/MaterialRows'
import { useCourseWorkspace } from '../../../components/shell/academy'

/** The course's lectures in the order they were taught, each opening as a written lesson. */
export default function LecturesPage() {
  const courseId = Number(useParams<{ id: string }>().id)
  const workspace = useCourseWorkspace()
  const detail = workspace?.detail ?? null
  if (!workspace) return <PageNote>This part of Lyceo isn’t available here yet.</PageNote>
  const all = detail?.lectures ?? []
  const lectures = all.filter((m) => m.role === 'lecture')
  const read = lectures.filter((l) => l.sections > 0 && l.completed >= l.sections).length

  return (
    <LearnPage
      detail={detail}
      title="Lectures"
      description="In the order they were taught. Open one to study it as a written lesson, with Ask Lyceo beside it. If the order or a date is off, edit it here."
      actions={<AddLink href={`/materials/new?course=${courseId}&role=lecture`}>Add a lecture</AddLink>}
    >
      <Paper
        title={lectures.length ? `${lectures.length} ${lectures.length === 1 ? 'lecture' : 'lectures'}` : undefined}
        aside={lectures.length ? <span className="text-[0.86rem] text-ink-soft">{read} read</span> : undefined}
      >
        {detail ? (
          <MaterialRows
            items={lectures}
            courseId={courseId}
            numbered
            order={all.map((m) => m.id)}
            onChanged={workspace.reload}
            empty="No lectures yet. Add the slides or notes from a class and Lyceo turns them into a lesson."
          />
        ) : (
          <p className="text-ink-soft">Opening the course</p>
        )}
      </Paper>
    </LearnPage>
  )
}
