import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: NextRequest) {
  try {
    const { fileUrl } = await req.json()

    // Descarga el audio
    const response = await fetch(fileUrl)
    const blob = await response.blob()
    const file = new File([blob], 'audio.mp3', { type: 'audio/mpeg' })

    // Transcribe con Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'es'
    })

    return NextResponse.json({
      success: true,
      text: transcription.text
    })

  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: 'Error transcribiendo audio' }, { status: 500 })
  }
}