import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import { finishUpload, privateUploadsEnabled, readMaterialFile } from '../../../../lib/server/materials'
import { readPdfPages } from '../../../../lib/server/material-map'
import { loopAllowed } from '../../../../lib/server/learning-data'
import { acceptUpload, rejectUpload, saveMaterialText } from '../../../../lib/server/records'

export const maxDuration = 60

type Context = { params: Promise<{ id: string }> }

/**
 * Checks the uploaded file and accepts it, or deletes it and says why. Then reads a PDF's text page by page. Calling it
 * twice is safe: an accepted file whose text wasn't read yet is read again.
 */
export async function POST(req: NextRequest, context: Context) {
  try {
    if (!privateUploadsEnabled()) throw new HttpError(404, 'This part of Lyceo is not available yet.')
    const { user, db } = await requireUser(req)
    if (!loopAllowed(user)) throw new HttpError(404, 'This part of Lyceo is not available yet.')
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(404, 'That material does not exist.')

    const { data: material, error } = await db
      .from('materials')
      .select('id, kind, status, declared_bytes, byte_size, failure, storage_key')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!material) throw new HttpError(404, 'That material does not exist.')
    if (material.status === 'failed') throw new HttpError(422, material.failure || 'That upload was rejected.')
    if (material.status === 'extracted' || material.status === 'mapped')
      return NextResponse.json({ materialId: id, status: material.status, bytes: material.byte_size })

    let key = material.storage_key as string | null
    let bytes = material.byte_size as number | null
    if (material.status === 'pending') {
      const check = await finishUpload(user.id, id, material.declared_bytes)
      if (!check.ok) {
        if (!check.retryable) await rejectUpload(user.id, id, check.reason)
        throw new HttpError(check.retryable ? 409 : 422, check.reason)
      }
      key = await acceptUpload(user.id, id, check.bytes)
      bytes = check.bytes
    }
    // Recordings are kept for lessons; only PDFs are read here.
    if (material.kind !== 'pdf' || !key) return NextResponse.json({ materialId: id, status: 'uploaded', bytes })

    let read
    try {
      read = await readPdfPages(await readMaterialFile(user.id, key))
    } catch (err) {
      if (err instanceof HttpError) await rejectUpload(user.id, id, err.message)
      else if (!(err instanceof Error && /timeout|ECONN|fetch/i.test(err.message)))
        await rejectUpload(user.id, id, 'Lyceo couldn’t read this PDF. Try exporting it again.')
      throw err
    }
    await saveMaterialText(user.id, id, read.text, read.pages)
    return NextResponse.json({
      materialId: id,
      status: 'extracted',
      bytes,
      pages: read.keptPages,
      totalPages: read.totalPages,
    })
  } catch (err) {
    return errorResponse(err, 'Could not check the upload.')
  }
}
