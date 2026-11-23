import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import {
  assertOwnCourse,
  buildCourseDetail,
  loadAcademyData,
  rows,
  text,
  todayFrom,
  toCourse,
} from '../../../../lib/server/academy'
import { learningLoopEnabled, loadLearning } from '../../../../lib/server/learning-data'
import { deleteMaterialFiles } from '../../../../lib/server/materials'
import { forgetMaterial } from '../../../../lib/server/records'
import { validTimeZone } from '../../../../lib/mastery'

type Context = { params: Promise<{ id: string }> }

/** One course: its lessons with progress, its deadlines and what to do next in it. */
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { user, db } = await requireUser(req)
    const id = Number((await params).id)
    if (!Number.isInteger(id)) throw new HttpError(404, 'That course does not exist.')
    const today = todayFrom(req)
    const tz = validTimeZone(new URL(req.url).searchParams.get('tz'))
    const [data, learning] = await Promise.all([
      loadAcademyData(db, user.id),
      learningLoopEnabled(user) ? loadLearning(db, { tz, today }) : null,
    ])
    return NextResponse.json(buildCourseDetail(data, id, today, learning ? { learning, now: new Date() } : undefined))
  } catch (err) {
    return errorResponse(err, 'Could not load the course.')
  }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const { user, db } = await requireUser(req)
    const id = await assertOwnCourse(db, user.id, (await params).id)
    const body = await req.json()
    const changes: Record<string, string | null> = {}
    if ('name' in body) changes.name = text(body.name, 'Course name', 120, true)
    if ('code' in body) changes.code = text(body.code, 'Course code', 30)
    if ('term' in body) changes.term = text(body.term, 'Term', 40)
    if ('archived' in body) changes.archived_at = body.archived ? new Date().toISOString() : null
    const data = rows(
      await db
        .from('academy_courses')
        .update(changes)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id, name, code, term, created_at')
        .single(),
    )
    return NextResponse.json({ course: toCourse(data) })
  } catch (err) {
    return errorResponse(err, 'Could not update the course.')
  }
}

/** Deletes the course and its deadlines. Its lessons stay, without a course. */
export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { user, db } = await requireUser(req)
    const id = await assertOwnCourse(db, user.id, (await params).id)
    // The course's materials go with it, files first: a material left without its course would be out of sight.
    // (Its skills, Quick Checks and their answers are deleted by the database with the course.)
    if (learningLoopEnabled()) {
      const materials = rows(await db.from('materials').select('id').eq('academy_course_id', id).eq('user_id', user.id))
      for (const m of materials as { id: number }[]) {
        await deleteMaterialFiles(user.id, m.id)
        await forgetMaterial(user.id, m.id)
      }
    }
    rows(await db.from('academy_courses').delete().eq('id', id).eq('user_id', user.id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, 'Could not delete the course.')
  }
}
