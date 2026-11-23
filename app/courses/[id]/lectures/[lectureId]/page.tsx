'use client'

import { useParams } from 'next/navigation'
import { LectureWorkspace } from '../../../../components/learn/LectureWorkspace'

/** One lecture of a course, taught as a written lesson, with Ask Lyceo beside it. */
export default function LecturePage() {
  const params = useParams<{ id: string; lectureId: string }>()
  // A new lecture starts fresh: its own lesson, place and conversation.
  return <LectureWorkspace key={params.lectureId} courseId={Number(params.id)} lectureId={Number(params.lectureId)} />
}
