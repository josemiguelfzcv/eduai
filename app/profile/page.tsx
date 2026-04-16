'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CAREERS = [
  "Ciencias de la Computación", "Matemáticas", "Física", "Química",
  "Biología", "Economía", "Psicología", "Historia", "Literatura",
  "Ingeniería", "Medicina", "Derecho", "Otra"
]

const STYLES = [
  { id: "analogias", label: "🍎 Con analogías y ejemplos cotidianos" },
  { id: "formal", label: "📚 Formal y estructurado" },
  { id: "codigo", label: "💻 Con ejemplos de código" },
  { id: "visual", label: "🎨 Visual y con diagramas" },
]

export default function Profile() {
  const [user, setUser] = useState<any>(null)
  const [name, setName] = useState('')
  const [career, setCareer] = useState('')
  const [style, setStyle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUser(data.user)
        setName(data.user.user_metadata?.full_name || '')

        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single()

        if (profile) {
          setCareer(profile.career || '')
          setStyle(profile.learning_style || '')
        }
      }
    })
  }, [])

  const save = async () => {
    if (!user) return
    setSaving(true)

    await supabase.from('users').upsert({
      id: user.id,
      email: user.email,
      name: name,
      career: career,
      learning_style: style
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ minHeight: "100vh", padding: "40px", maxWidth: "560px", margin: "0 auto" }}>
      <a href="/dashboard" style={{ color: "#4285F4", fontSize: "0.85rem", textDecoration: "none" }}>
        ← Volver al dashboard
      </a>

      <h1 style={{ marginTop: "24px", marginBottom: "8px" }}>Mi perfil</h1>
      <p style={{ color: "#8b92a5", marginBottom: "32px" }}>
        Esto ayuda a StudyAI a personalizar las clases para ti
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.8rem", color: "#8b92a5", marginBottom: "8px" }}>
            NOMBRE
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%", padding: "12px 16px",
              borderRadius: "8px", border: "1px solid #252a38",
              background: "#181c26", color: "#e8eaf0", fontSize: "0.95rem"
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.8rem", color: "#8b92a5", marginBottom: "8px" }}>
            CARRERA
          </label>
          <select
            value={career}
            onChange={(e) => setCareer(e.target.value)}
            style={{
              width: "100%", padding: "12px 16px",
              borderRadius: "8px", border: "1px solid #252a38",
              background: "#181c26", color: "#e8eaf0", fontSize: "0.95rem"
            }}
          >
            <option value="">Selecciona tu carrera</option>
            {CAREERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.8rem", color: "#8b92a5", marginBottom: "12px" }}>
            ¿CÓMO PREFIERES QUE TE EXPLIQUEN?
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {STYLES.map(s => (
              <div
                key={s.id}
                onClick={() => setStyle(s.id)}
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${style === s.id ? '#4285F4' : '#252a38'}`,
                  background: style === s.id ? '#1a2035' : '#181c26',
                  cursor: "pointer",
                  color: style === s.id ? "#e8eaf0" : "#8b92a5",
                  fontSize: "0.88rem",
                  transition: "all 0.15s"
                }}
              >
                {s.label}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "14px",
            background: saved ? "#22d98a" : saving ? "#252a38" : "#4285F4",
            color: saved ? "#000" : "white",
            border: "none",
            borderRadius: "8px",
            cursor: saving ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: "0.95rem",
            marginTop: "8px"
          }}
        >
          {saved ? "✅ Guardado" : saving ? "Guardando..." : "Guardar perfil"}
        </button>
      </div>
    </div>
  )
}