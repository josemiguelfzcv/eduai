'use client'

import { useState, useEffect } from 'react'
import { generateUploadButton } from '@uploadthing/react'
import type { OurFileRouter } from '../api/uploadthing/route'
import { supabase } from '../lib/supabase'

const UploadButton = generateUploadButton<OurFileRouter>()

export default function Upload() {
  const [extractedText, setExtractedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [courseTitle, setCourseTitle] = useState('')
  const [script, setScript] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  const handleUploadComplete = async (res: any) => {
    const file = res[0]
    const fileUrl = file.ufsUrl
    const fileName = file.name
    const isPdf = fileName.endsWith('.pdf')

    setLoading(true)
    setStatus(isPdf ? '📄 Extrayendo texto del PDF...' : '🎙️ Transcribiendo audio con Whisper...')

    const endpoint = isPdf ? '/api/extract-pdf' : '/api/transcribe'

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileUrl, userId, courseTitle })
    })

    const data = await response.json()
    setExtractedText(data.text)

    setStatus('🧠 Generando tu clase personalizada con IA...')

    const scriptResponse = await fetch('/api/synthesize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: data.text, courseTitle, userId, courseId: data.courseId })
})

    const scriptData = await scriptResponse.json()
    setScript(scriptData.script)
    setLoading(false)
    setStatus('✅ ¡Tu clase está lista!')
  }

  return (
    <div style={{
      minHeight: "100vh",
      padding: "40px",
      maxWidth: "680px",
      margin: "0 auto"
    }}>
      <a href="/dashboard" style={{ color: "#4285F4", fontSize: "0.85rem", textDecoration: "none" }}>
        ← Volver al dashboard
      </a>

      <h1 style={{ marginTop: "24px", marginBottom: "8px" }}>Nueva clase 📚</h1>
      <p style={{ marginBottom: "32px" }}>Sube tus apuntes (PDF) o grabación de clase (MP3/MP4)</p>

      <input
        type="text"
        placeholder="Nombre de la clase (ej: Estadística 201)"
        value={courseTitle}
        onChange={(e) => setCourseTitle(e.target.value)}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: "8px",
          border: "1px solid #252a38",
          background: "#181c26",
          color: "#e8eaf0",
          fontSize: "1rem",
          marginBottom: "20px"
        }}
      />

      <UploadButton
        endpoint="pdfUploader"
        onClientUploadComplete={handleUploadComplete}
        onUploadError={(error) => alert("Error: " + error.message)}
      />

      {loading && (
        <p style={{ marginTop: "24px", color: "#4285F4" }}>{status}</p>
      )}

      {script && (
        <div style={{
          marginTop: "32px",
          padding: "24px",
          background: "#181c26",
          borderRadius: "12px",
          border: "1px solid #252a38"
        }}>
          <p style={{ color: "#22d98a", fontWeight: 700, marginBottom: "16px" }}>✅ ¡Tu clase está lista!</p>
          <h2 style={{ color: "#e8eaf0", marginBottom: "8px" }}>📖 {script.titulo}</h2>
          <p style={{ color: "#8b92a5", marginBottom: "24px" }}>⏱ {script.duracion_estimada}</p>
          {Array.isArray(script.segmentos) && script.segmentos.map((seg: any, i: number) => (
            <div key={i} style={{
              padding: "16px",
              background: "#0f1117",
              borderRadius: "8px",
              marginBottom: "12px",
              borderLeft: "3px solid #4285F4"
            }}>
              <p style={{ color: "#4285F4", fontSize: "0.75rem", marginBottom: "6px" }}>
                SEGMENTO {seg.orden}
              </p>
              <h3 style={{ color: "#e8eaf0", marginBottom: "8px" }}>{seg.concepto}</h3>
              <p style={{ fontSize: "0.85rem", color: "#8b92a5", marginBottom: "8px" }}>
                🗣 {seg.narracion}
              </p>
              <p style={{ fontSize: "0.82rem", color: "#ffd166" }}>
                📐 Pizarra: {seg.pizarra}
              </p>
              <p style={{ fontSize: "0.8rem", color: "#22d98a", marginTop: "8px" }}>
                ❓ {seg.pregunta_check}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}