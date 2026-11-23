'use client'

import { useParams } from 'next/navigation'
import { Deadlines } from '../../../components/academy/Deadlines'
import { AddLink, LearnPage, PageNote, Paper } from '../../../components/learn/LearnPage'
import { MaterialRows } from '../../../components/learn/MaterialRows'
import { useCourseWorkspace } from '../../../components/shell/academy'

/** What's due in the course, and the assignments the student added to study from. */
export default function AssignmentsPage() {
  const courseId = Number(useParams<{ id: string }>().id)
  const workspace = useCourseWorkspace()
  const detail = workspace?.detail ?? null
  if (!workspace) return <PageNote>This part of Lyceo isn’t available here yet.</PageNote>
  const assignments = (detail?.lectures ?? []).filter((m) => m.role === 'assignment')

  return (
    <LearnPage
      detail={detail}
      title="Assignments"
      description="Deadlines, and the assignments you’ve added. Lyceo explains the ideas behind an assignment’s problems; it doesn’t solve them for you."
      actions={<AddLink href={`/materials/new?course=${courseId}&role=assignment`}>Add an assignment</AddLink>}
    >
      {detail ? (
        <>
          <Paper>
            <Deadlines
              deadlines={detail.deadlines}
              courses={detail.courses}
              courseId={courseId}
              onChange={workspace.reload}
            />
          </Paper>
          <Paper title="Assignment files">
            <MaterialRows
              items={assignments}
              courseId={courseId}
              onChanged={workspace.reload}
              empty="None yet. Add a problem set to study the ideas it uses, or mark a material as an assignment."
            />
          </Paper>
        </>
      ) : (
        <Paper>
          <p className="text-ink-soft">Opening the course</p>
        </Paper>
      )}
    </LearnPage>
  )
}
