import { NextRequest, NextResponse } from 'next/server'
import { extractText } from 'unpdf'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { fileUrl, userId, courseTitle } = await req.json()

    // Extrae el texto
    const response = await fetch(fileUrl)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)
    const { text } = await extractText(buffer, { mergePages: true })

    // Guarda en Supabase
    const { data, error } = await supabase
      .from('courses')
      .insert({
        user_id: userId,
        title: courseTitle || 'Nueva clase',
        description: text.slice(0, 500),
        status: 'extracted'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      text: text,
      courseId: data.id
    })

  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: 'Error extrayendo texto' }, { status: 500 })
  }
}