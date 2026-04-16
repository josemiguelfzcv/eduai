import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { question, answer, concept, narration, userId, courseId, segmentIndex, timeToAnswer } = await req.json()

    console.log('DATOS RECIBIDOS:', { userId, courseId, segmentIndex, timeToAnswer })

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      prompt: `Eres un profesor joven, cercano y con sentido del humor que está evaluando la respuesta de un estudiante en una sesión uno a uno.

Concepto explicado: ${concept}
Explicación dada: ${narration}
Pregunta hecha: ${question}
Respuesta del estudiante: "${answer}"

Evalúa la respuesta y reacciona de forma HUMANA y PERSONALIZADA a lo que el estudiante dijo específicamente.

Si la respuesta es graciosa o muy equivocada: reacciona con humor ligero (puedes usar "jajaja", "😂", "eso estuvo gracioso pero...").
Si se acerca pero no llega: anímalos ("¡casi!", "vas por buen camino...").
Si es correcta: celebra de forma genuina y específica a su respuesta.
Si es una respuesta al azar o sin sentido: llámalo out con humor.

Responde SOLO con este JSON:
{
  "correcto": true o false,
  "feedback": "reacción personalizada y humana a LO QUE DIJO el estudiante específicamente (2-3 oraciones, con personalidad)",
  "reexplicacion_narracion": "si correcto es false: re-explica el concepto de forma diferente con una analogía nueva, mencionando brevemente lo que dijo el estudiante para conectar. Si correcto es true: deja vacío.",
  "reexplicacion_pizarra": "si correcto es false: frase corta, diagrama o ecuación clave que refuerza el concepto (máx 10 palabras). Si correcto es true: deja vacío."
}

Responde SOLO con el JSON, sin texto adicional ni backticks.`
    })

    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    const result = JSON.parse(cleaned)

    // Guarda en Supabase
    if (userId && courseId) {
      const { error: dbError } = await supabase.from('session_events').insert({
        user_id: userId,
        course_id: Number(courseId),
        segment_index: segmentIndex,
        question: question,
        answer: answer,
        correct: result.correcto,
        time_to_answer_seconds: timeToAnswer
      })
      if (dbError) console.error('Error guardando en Supabase:', dbError)
    }

    return NextResponse.json({ success: true, ...result })

  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: 'Error evaluando respuesta' }, { status: 500 })
  }
}