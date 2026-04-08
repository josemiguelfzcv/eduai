import { NextRequest, NextResponse } from 'next/server'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
})

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!
  }
})

export async function POST(req: NextRequest) {
  try {
    const { text, segmentId } = await req.json()
    const key = `segments/${segmentId}.mp3`

    // Verifica si el audio ya existe en R2
    let audioExists = false
    try {
      await r2.send(new HeadObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET,
        Key: key
      }))
      audioExists = true
    } catch {
      audioExists = false
    }

    // Si no existe, genera con ElevenLabs y sube a R2
    if (!audioExists) {
      const stream = await elevenlabs.textToSpeech.convert('JBFqnCBsd6RMkjVDRZzb', {
        text: text,
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128'
      })

      const reader = stream.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
      const audioBuffer = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        audioBuffer.set(chunk, offset)
        offset += chunk.length
      }

      await r2.send(new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET,
        Key: key,
        Body: audioBuffer,
        ContentType: 'audio/mpeg'
      }))

      console.log('Audio generado y guardado en R2:', key)
    } else {
      console.log('Audio ya existe en R2, sirviendo desde caché:', key)
    }

    // Genera URL firmada para reproducir
    const url = await getSignedUrl(r2, new GetObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key
    }), { expiresIn: 3600 })

    return NextResponse.json({ success: true, url, cached: audioExists })

  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Error generando audio' }, { status: 500 })
  }
}