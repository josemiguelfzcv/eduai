'use client'

import { useState } from 'react'
import { generateUploadButton } from '@uploadthing/react'
import type { OurFileRouter } from '../api/uploadthing/route'

const UploadButton = generateUploadButton<OurFileRouter>()

export default function Upload() {
  const [extractedText, setExtractedText] = useState('')
  const [loading, setLoading] = useState(false)

  const handleUploadComplete = async (res: any) => {
    const fileUrl = res[0].ufsUrl
    setLoading(true)

    const response = await fetch('/api/extract-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileUrl })
    })

    const data = await response.json()
    setExtractedText(data.text)
    setLoading(false)
  }

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <h1>StudyAI 🎓</h1>
      <p style={{ color: "#666", marginBottom: "24px" }}>Sube los materiales de tu clase</p>

      <UploadButton
        endpoint="pdfUploader"
        onClientUploadComplete={handleUploadComplete}
        onUploadError={(error) => alert("Error: " + error.message)}
      />

      {loading && <p style={{ marginTop: "24px", color: "#666" }}>⏳ Extrayendo texto del PDF...</p>}

      {extractedText && (
        <div style={{ marginTop: "24px", padding: "20px", background: "#f5f5f5", borderRadius: "8px" }}>
          <h3>Texto extraído:</h3>
          <p style={{ fontSize: "0.85rem", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
            {extractedText.slice(0, 1000)}...
          </p>
        </div>
      )}
    </div>
  )
}