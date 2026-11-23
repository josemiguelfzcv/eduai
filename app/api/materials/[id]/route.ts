import { NextRequest, NextResponse } from 'next/server'
import { isIsoDate, text } from '../../../lib/server/academy'
import { errorResponse, HttpError, requireUser } from '../../../lib/server/auth'
import { deleteMaterialFiles, privateUploadsEnabled } from '../../../lib/server/materials'
import { forgetMaterial } from '../../../lib/server/records'
import { requireLearningLoop } from '../../../lib/server/learning-data'
import { materialView } from '../../../lib/server/material-map'

type Context = { params: Promise<{ id: string }> }

/** A material with its skill map, as the student reviews it. */
export async function GET(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(404, 'That material does not exist.')
    return NextResponse.json(await materialView(db, id, user.id))
  } catch (err) {
    return errorResponse(err, 'Could not load this material.')
  }
}

const ROLES = ['lecture', 'assignment', 'reading', 'other'] as const

/**
 * Changes what a material is in its course: its title, whether it's a lecture, an assignment or a reading, and the
 * day it was given. Marking it an assignment also marks it graded, so Lyceo explains instead of solving it.
 */
export async function PATCH(req: NextRequest, context: Context) {
  try {
    if (!privateUploadsEnabled()) throw new HttpError(404, 'This part of Lyceo is not available yet.')
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(404, 'That material does not exist.')
    const body = await req.json().catch(() => ({}))

    const changes: { title?: string; role?: (typeof ROLES)[number]; lecture_date?: string | null; policy?: 'graded' } =
      {}
    if ('title' in body) changes.title = text(body.title, 'Title', 200, true)!
    if ('role' in body) {
      if (!ROLES.includes(body.role)) throw new HttpError(400, 'Choose lecture, assignment, reading or other.')
      changes.role = body.role
      if (body.role === 'assignment') changes.policy = 'graded'
    }
    if ('lectureDate' in body) {
      if (body.lectureDate !== null && !isIsoDate(body.lectureDate)) throw new HttpError(400, 'That date isn’t valid.')
      changes.lecture_date = body.lectureDate
    }
    if (!Object.keys(changes).length) throw new HttpError(400, 'Nothing to change.')

    const { data, error } = await db
      .from('materials')
      .update(changes)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HttpError(404, 'That material does not exist.')
    return NextResponse.json({ updated: true })
  } catch (err) {
    return errorResponse(err, 'Could not change the material.')
  }
}

/** Deletes a material: its file first, then the row. If the file can't be deleted, the row stays so it can be retried. */
export async function DELETE(req: NextRequest, context: Context) {
  try {
    if (!privateUploadsEnabled()) throw new HttpError(404, 'This part of Lyceo is not available yet.')
    const { user, db } = await requireUser(req)
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(404, 'That material does not exist.')

    const { data: material, error } = await db
      .from('materials')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!material) throw new HttpError(404, 'That material does not exist.')

    await deleteMaterialFiles(user.id, id)
    await forgetMaterial(user.id, id)
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return errorResponse(err, 'Could not delete the material. Nothing was deleted.')
  }
}
