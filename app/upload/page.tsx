'use client'

import { generateUploadButton } from '@uploadthing/react'
import type { OurFileRouter } from '../api/uploadthing/route'

const UploadButton = generateUploadButton<OurFileRouter>()

export default function Upload() {
  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <h1>StudyAI 🎓</h1>
      <p style={{ color: "#666", marginBottom: "24px" }}>Sube los materiales de tu clase</p>

      <UploadButton
        endpoint="pdfUploader"
        onClientUploadComplete={(res) => {
          console.log("Subido:", res)
          alert("✅ ¡Archivo subido correctamente!")
        }}
        onUploadError={(error) => {
          alert("Error: " + error.message)
        }}
      />
    </div>
  )
}