'use client'

import { useParams } from 'next/navigation'
import { LectureWorkspace } from '../../../../components/learn/LectureWorkspace'

/**
 * One assignment of a course. For now it opens as a written lesson on the ideas it uses, with Ask Lyceo (which won't
 * solve its problems); the preparation workspace with Prepare, Practice, Solutions and Progress replaces it.
 */
export default function AssignmentPage() {
  const params = useParams<{ id: string; assignmentId: string }>()
  return (
    <LectureWorkspace
      key={params.assignmentId}
      courseId={Number(params.id)}
      lectureId={Number(params.assignmentId)}
      section="assignments"
    />
  )
}
