import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../lib/server/auth'
import { deleteMaterialFiles, privateUploadsEnabled } from '../../../lib/server/materials'
import { forgetMaterial } from '../../../lib/server/records'
import { requireLearningLoop } from '../../../lib/server/learning-data'
import { materialView } from '../../../lib/server/material-map'

type Context = { params: Promise<{ id: string }> }

/** A material with its skill map, as the student reviews it. */
export async function GET(req: NextRequest, context: Context) {
  try {
    requireLearningLoop()
    const { user, db } = await requireUser(req)
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(404, 'That material does not exist.')
    return NextResponse.json(await materialView(db, id, user.id))
  } catch (err) {
    return errorResponse(err, 'Could not load this material.')
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
