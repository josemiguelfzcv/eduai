import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../../lib/server/auth'
import {
  assertOwnCourse,
  DEADLINE_COLUMNS,
  deadlineKind,
  dueDate,
  rows,
  text,
  toDeadline,
} from '../../../lib/server/academy'
import { syncSoon } from '../../../lib/server/calendar-sync'

export async function POST(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const body = await req.json()
    const courseId = await assertOwnCourse(db, user.id, body.courseId)
    const data = rows(
      await db
        .from('deadlines')
        .insert({
          user_id: user.id,
          course_id: courseId,
          title: text(body.title, 'Title', 120, true),
          kind: deadlineKind(body.kind),
          due_on: dueDate(body.dueOn),
          topics: text(body.topics, 'Topics', 500),
        })
        .select(DEADLINE_COLUMNS)
        .single(),
    )
    syncSoon(db, user.id)
    return NextResponse.json({ deadline: toDeadline(data) })
  } catch (err) {
    return errorResponse(err, 'Could not add the deadline.')
  }
}
