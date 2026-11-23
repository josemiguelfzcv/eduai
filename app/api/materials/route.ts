import { NextRequest, NextResponse } from 'next/server'
import { assertOwnCourse, rows, text } from '../../lib/server/academy'
import { errorResponse, HttpError, requireUser } from '../../lib/server/auth'
import { checkDeclaredFile, FILE_RULES, prepareUpload, privateUploadsEnabled } from '../../lib/server/materials'
import { loopAllowed } from '../../lib/server/learning-data'

/** At most this many uploads can be waiting to arrive at once, so nobody can stockpile upload links. */
const MAX_PENDING = 10

/**
 * Starts a private upload: creates the material (as the student, so row-level security applies) and returns a
 * presigned PUT for exactly this file. Then the browser uploads it and calls /api/materials/<id>/complete.
 */
export async function POST(req: NextRequest) {
  try {
    if (!privateUploadsEnabled()) throw new HttpError(404, 'This part of Lyceo is not available yet.')
    const { user, db } = await requireUser(req)
    if (!loopAllowed(user)) throw new HttpError(404, 'This part of Lyceo is not available yet.')
    const body = await req.json()
    const problem = checkDeclaredFile(body.contentType, body.bytes)
    if (problem) throw new HttpError(400, problem)
    const title = text(body.title, 'Title', 200, true)!
    const courseId = body.academyCourseId ? await assertOwnCourse(db, user.id, body.academyCourseId) : null

    const { count } = await db
      .from('materials')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')
    if ((count ?? 0) >= MAX_PENDING) throw new HttpError(429, 'Finish or cancel your other uploads first.')

    const material = rows<{ id: number } | null>(
      await db
        .from('materials')
        .insert({
          kind: FILE_RULES[body.contentType].kind,
          title,
          declared_bytes: body.bytes,
          academy_course_id: courseId,
          policy: body.policy === 'graded' ? 'graded' : 'study',
        })
        .select('id')
        .single(),
    )
    if (!material) throw new HttpError(500, 'Could not start the upload.')
    const upload = await prepareUpload(user.id, material.id, body.contentType, body.bytes)
    return NextResponse.json({ materialId: material.id, upload })
  } catch (err) {
    return errorResponse(err, 'Could not start the upload.')
  }
}
