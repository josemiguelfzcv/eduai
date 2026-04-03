'use client'

import { useState } from 'react'
import { generateUploadButton } from '@uploadthing/react'
import type { OurFileRouter } from '../transcribe/uploadthing/route'

const UploadButton = generateUploadButton<OurFileRouter>()

export default function Upload() {
  const [extractedText, setExtractedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

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
      body: JSON.stringify({ fileUrl })
    })

    const data = await response.json()
    setExtractedText(data.text)
    setLoading(false)
    setStatus('✅ Listo')
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

      <UploadButton
        endpoint="pdfUploader"
        onClientUploadComplete={handleUploadComplete}
        onUploadError={(error) => alert("Error: " + error.message)}
      />

      {loading && (
        <p style={{ marginTop: "24px", color: "#4285F4" }}>{status}</p>
      )}

      {extractedText && (
        <div style={{
          marginTop: "32px",
          padding: "24px",
          background: "#181c26",
          borderRadius: "12px",
          border: "1px solid #252a38"
        }}>
          <p style={{ color: "#22d98a", fontWeight: 700, marginBottom: "12px" }}>✅ {status}</p>
          <h3 style={{ marginBottom: "12px", color: "#e8eaf0" }}>Texto extraído:</h3>
          <p style={{
            fontSize: "0.82rem",
            lineHeight: "1.7",
            whiteSpace: "pre-wrap",
            color: "#8b92a5"
          }}>
            {extractedText.slice(0, 1500)}...
          </p>
        </div>
      )}
    </div>
  )
}