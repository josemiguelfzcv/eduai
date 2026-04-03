import { NextRequest, NextResponse } from 'next/server'
import { extractText } from 'unpdf'

export async function POST(req: NextRequest) {
  try {
    const { fileUrl } = await req.json()

    const response = await fetch(fileUrl)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { text } = await extractText(buffer, { mergePages: true })

    return NextResponse.json({
      success: true,
      text: text
    })

  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: 'Error extrayendo texto' }, { status: 500 })
  }
}