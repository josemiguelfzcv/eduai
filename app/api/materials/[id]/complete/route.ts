import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import { finishUpload, privateUploadsEnabled } from '../../../../lib/server/materials'
import { acceptUpload, rejectUpload } from '../../../../lib/server/records'

type Context = { params: Promise<{ id: string }> }

/** Checks the uploaded file and accepts it, or deletes it and says why. Calling it twice is safe. */
export async function POST(req: NextRequest, context: Context) {
  try {
    if (!privateUploadsEnabled()) throw new HttpError(404, 'This part of Lyceo is not available yet.')
    const { user, db } = await requireUser(req)
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(404, 'That material does not exist.')

    const { data: material, error } = await db
      .from('materials')
      .select('id, status, declared_bytes, byte_size, failure')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!material) throw new HttpError(404, 'That material does not exist.')
    if (material.status !== 'pending') {
      if (material.status === 'failed') throw new HttpError(422, material.failure || 'That upload was rejected.')
      return NextResponse.json({ materialId: id, status: material.status, bytes: material.byte_size })
    }

    const check = await finishUpload(user.id, id, material.declared_bytes)
    if (!check.ok) {
      if (!check.retryable) await rejectUpload(user.id, id, check.reason)
      throw new HttpError(check.retryable ? 409 : 422, check.reason)
    }
    await acceptUpload(user.id, id, check.bytes)
    return NextResponse.json({ materialId: id, status: 'uploaded', bytes: check.bytes, kind: check.kind })
  } catch (err) {
    return errorResponse(err, 'Could not check the upload.')
  }
}
