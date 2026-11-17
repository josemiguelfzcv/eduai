import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { assertUploadUrl, errorResponse, HttpError, requireUser } from '../../lib/server/auth'
import { createCourse } from '../../lib/server/courses'

const WHISPER_LIMIT = 25 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const { fileUrl, fileName, title } = await req.json()

    const res = await fetch(assertUploadUrl(fileUrl))
    if (!res.ok) throw new HttpError(502, 'Could not download the recording. Try uploading it again.')
    const blob = await res.blob()
    if (blob.size > WHISPER_LIMIT) {
      throw new HttpError(413, 'Recordings must be under 25 MB. Trim it or export it at a lower bitrate.')
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const name = typeof fileName === 'string' && fileName ? fileName : 'recording.mp3'
    const transcription = await openai.audio.transcriptions.create({
      file: new File([blob], name, { type: blob.type || 'audio/mpeg' }),
      model: 'whisper-1',
    })

    const text = transcription.text
    if (text.trim().length < 200) throw new HttpError(422, 'The recording is too short to build a lesson from.')

    const courseId = await createCourse(db, user.id, title, text)
    return NextResponse.json({ courseId, text })
  } catch (err) {
    return errorResponse(err, 'Could not transcribe the recording.')
  }
}
