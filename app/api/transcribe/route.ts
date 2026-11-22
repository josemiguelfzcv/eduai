import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { assertUploadUrl, errorResponse, HttpError, requireUser } from '../../lib/server/auth'
import { assertOwnCourse } from '../../lib/server/academy'
import { createCourse } from '../../lib/server/courses'
import { recordUsage } from '../../lib/server/usage'

const WHISPER_LIMIT = 25 * 1024 * 1024
const STT_MODEL = 'whisper-1'

export async function POST(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const { fileUrl, fileName, title, academyCourseId } = await req.json()
    const courseId = academyCourseId ? await assertOwnCourse(db, user.id, academyCourseId) : null

    const res = await fetch(assertUploadUrl(fileUrl))
    if (!res.ok) throw new HttpError(502, 'Could not download the recording. Try uploading it again.')
    const blob = await res.blob()
    if (blob.size > WHISPER_LIMIT) {
      throw new HttpError(413, 'Recordings must be under 25 MB. Trim it or export it at a lower bitrate.')
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const name = typeof fileName === 'string' && fileName ? fileName : 'recording.mp3'
    const started = Date.now()
    const usage = { task: 'transcribe', provider: 'openai', model: STT_MODEL, userId: user.id } as const
    let transcription
    try {
      // verbose_json adds the audio duration, which is what transcription is billed by.
      transcription = await openai.audio.transcriptions.create({
        file: new File([blob], name, { type: blob.type || 'audio/mpeg' }),
        model: STT_MODEL,
        response_format: 'verbose_json',
      })
    } catch (err) {
      recordUsage({ ...usage, latencyMs: Date.now() - started, ok: false })
      throw err
    }
    recordUsage({ ...usage, seconds: transcription.duration, latencyMs: Date.now() - started, ok: true })

    const text = transcription.text
    if (text.trim().length < 200) throw new HttpError(422, 'The recording is too short to build a lesson from.')

    const lessonId = await createCourse(db, user.id, title, text, courseId)
    return NextResponse.json({ courseId: lessonId, text })
  } catch (err) {
    return errorResponse(err, 'Could not transcribe the recording.')
  }
}
