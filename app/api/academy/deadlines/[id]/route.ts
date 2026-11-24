import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import {
  assertOwnCourse,
  DEADLINE_COLUMNS,
  deadlineKind,
  dueDate,
  rows,
  text,
  toDeadline,
} from '../../../../lib/server/academy'
import { syncSoon } from '../../../../lib/server/calendar-sync'

type Context = { params: Promise<{ id: string }> }

async function ownDeadlineId(context: Context) {
  const id = Number((await context.params).id)
  if (!Number.isInteger(id)) throw new HttpError(404, 'That deadline does not exist.')
  return id
}

export async function PATCH(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    const id = await ownDeadlineId(context)
    const body = await req.json()
    const changes: Record<string, string | number | null> = {}
    if ('completed' in body) changes.completed_at = body.completed ? new Date().toISOString() : null
    if ('title' in body) changes.title = text(body.title, 'Title', 120, true)
    if ('kind' in body) changes.kind = deadlineKind(body.kind)
    if ('dueOn' in body) changes.due_on = dueDate(body.dueOn)
    if ('topics' in body) changes.topics = text(body.topics, 'Topics', 500)
    if ('courseId' in body) changes.course_id = await assertOwnCourse(db, user.id, body.courseId)
    const data = rows(
      await db
        .from('deadlines')
        .update(changes)
        .eq('id', id)
        .eq('user_id', user.id)
        .select(DEADLINE_COLUMNS)
        .maybeSingle(),
    )
    if (!data) throw new HttpError(404, 'That deadline does not exist or is not yours.')
    syncSoon(db, user.id)
    return NextResponse.json({ deadline: toDeadline(data) })
  } catch (err) {
    return errorResponse(err, 'Could not update the deadline.')
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    const id = await ownDeadlineId(context)
    rows(await db.from('deadlines').delete().eq('id', id).eq('user_id', user.id))
    syncSoon(db, user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, 'Could not delete the deadline.')
  }
}
