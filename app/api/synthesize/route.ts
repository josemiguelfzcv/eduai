import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

export async function POST(req: NextRequest) {
  try {
    const { text, courseTitle } = await req.json()

    const { text: responseText } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      prompt: `Eres un experto en educación. Analiza el siguiente material de clase y genera un script estructurado para explicárselo a un estudiante de forma clara y simple, como si fuera un profesor paciente explicando con ejemplos cotidianos.

Curso: ${courseTitle}

Material:
${text.slice(0, 8000)}

Genera un JSON con esta estructura exacta:
{
  "titulo": "título de la clase",
  "duracion_estimada": "X minutos",
  "segmentos": [
    {
      "orden": 1,
      "concepto": "nombre del concepto",
      "narracion": "lo que el profesor dice en voz alta, explicado simple",
      "pizarra": "lo que aparece escrito en la pizarra",
      "duracion_segundos": 120,
      "pregunta_check": "pregunta para verificar que el estudiante entendió"
    }
  ]
}

Responde SOLO con el JSON, sin texto adicional ni backticks.`
    })

    const cleaned = responseText
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    const script = JSON.parse(cleaned)

    return NextResponse.json({ success: true, script })

  } catch (error) {
    console.error(error)
    return NextResponse.json({ success: false, error: 'Error generando script' }, { status: 500 })
  }
}