import { NextRequest, NextResponse } from 'next/server'
import { extractText } from 'unpdf'
import { assertUploadUrl, errorResponse, HttpError, requireUser } from '../../lib/server/auth'
import { createCourse } from '../../lib/server/courses'

export async function POST(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const { fileUrl, title } = await req.json()

    const res = await fetch(assertUploadUrl(fileUrl))
    if (!res.ok) throw new HttpError(502, 'Could not download the PDF. Try uploading it again.')
    const { text } = await extractText(new Uint8Array(await res.arrayBuffer()), { mergePages: true })

    if (text.replace(/\s+/g, ' ').trim().length < 200) {
      throw new HttpError(
        422,
        "This PDF has almost no selectable text, so it's probably a scan. Export the slides as a text PDF and upload that instead.",
      )
    }

    const courseId = await createCourse(db, user.id, title, text)
    return NextResponse.json({ courseId, text })
  } catch (err) {
    return errorResponse(err, 'Could not read the PDF.')
  }
}
