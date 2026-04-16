'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [courses, setCourses] = useState<any[]>([])
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUser(data.user)

        await supabase.from('users').upsert({
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name,
        })

        const { data: coursesData } = await supabase
          .from('courses')
          .select('*')
          .eq('user_id', data.user.id)
          .order('created_at', { ascending: false })

        if (coursesData) setCourses(coursesData)

        if (!coursesData || coursesData.length === 0) {
          setShowOnboarding(true)
        }
      }
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ padding: "40px" }}>
      <p style={{ color: "#8b92a5" }}>⏳ Cargando...</p>
    </div>
  )

  if (showOnboarding) return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px",
      textAlign: "center"
    }}>
      <div style={{ maxWidth: "560px" }}>
        <p style={{ fontSize: "3rem", marginBottom: "16px" }}>👋</p>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "12px" }}>
          Bienvenido a StudyAI, {user?.user_metadata?.full_name?.split(' ')[0]}
        </h1>
        <p style={{ color: "#8b92a5", marginBottom: "40px", lineHeight: "1.7", fontSize: "1rem" }}>
          StudyAI convierte tus materiales de clase en una experiencia de aprendizaje personalizada — con un profesor de IA que te explica todo con peras y manzanas.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "40px" }}>
          {[
            { icon: "📄", title: "Sube tu material", desc: "PDFs, slides o grabaciones de audio de tus clases" },
            { icon: "🧠", title: "La IA lo procesa", desc: "Claude genera una clase personalizada para ti" },
            { icon: "🎓", title: "Aprende de verdad", desc: "Pizarra animada, voz del profesor y check-ins" }
          ].map((step, i) => (
            <div key={i} style={{
              padding: "20px 16px",
              background: "#181c26",
              borderRadius: "12px",
              border: "1px solid #252a38"
            }}>
              <div style={{ fontSize: "1.8rem", marginBottom: "8px" }}>{step.icon}</div>
              <p style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "6px", color: "#e8eaf0" }}>{step.title}</p>
              <p style={{ fontSize: "0.75rem", color: "#8b92a5", lineHeight: "1.5" }}>{step.desc}</p>
            </div>
          ))}
        </div>
        <a href="/upload" style={{
          display: "inline-block",
          padding: "16px 40px",
          background: "linear-gradient(135deg, #4285F4, #34a853)",
          color: "white",
          borderRadius: "12px",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: "1rem",
          boxShadow: "0 4px 24px rgba(66,133,244,0.3)"
        }}>
          Crear mi primera clase →
        </a>
      </div>
    </div>
  )

  const colors = ['#4285F4', '#34a853', '#c94f1e', '#8b1ec9', '#1ea35c', '#ff6b6b', '#ffd166']

  return (
    <div style={{ minHeight: "100vh", padding: "40px", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
  <div>
    <h1 style={{ marginBottom: "4px" }}>StudyAI 🎓</h1>
    <p style={{ color: "#8b92a5", fontSize: "0.85rem" }}>Hola, {user?.user_metadata?.full_name?.split(' ')[0]}</p>
  </div>
  <div style={{ display: "flex", gap: "10px" }}>
    <a href="/profile" style={{
      padding: "12px 20px",
      background: "#181c26",
      color: "#8b92a5",
      borderRadius: "8px",
      textDecoration: "none",
      fontWeight: 600,
      fontSize: "0.9rem",
      border: "1px solid #252a38"
    }}>
      👤 Perfil
    </a>
    <a href="/upload" style={{
      padding: "12px 24px",
      background: "#4285F4",
      color: "white",
      borderRadius: "8px",
      textDecoration: "none",
      fontWeight: 700,
      fontSize: "0.9rem"
    }}>
      + Nueva clase
    </a>
  </div>
</div>

      <h2 style={{ fontSize: "1rem", color: "#8b92a5", marginBottom: "16px", fontWeight: 400 }}>
        Tus clases ({courses.length})
      </h2>

      {courses.length === 0 ? (
        <p style={{ color: "#8b92a5" }}>No tienes clases todavía.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {courses.map((course) => {
            const titulo = course.script?.titulo || course.title || "Clase sin título"
            const initials = titulo.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
            const color = colors[course.id % colors.length]

            return (

              <a
              
                key={course.id}
                href={`/class/${course.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "16px 20px",
                  background: "#181c26",
                  borderRadius: "12px",
                  border: "1px solid #252a38",
                  textDecoration: "none"
                }}
              >
                <div style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "10px",
                  background: color + "22",
                  border: `1px solid ${color}44`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: color,
                  flexShrink: 0
                }}>
                  {initials}
                </div>
                <div style={{ flexGrow: 1 }}>
                  <p style={{ fontWeight: 700, color: "#e8eaf0", marginBottom: "4px", fontSize: "0.95rem" }}>
                    {titulo}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "#8b92a5" }}>
                    {course.script?.duracion_estimada && `⏱ ${course.script.duracion_estimada} · `}
                    {new Date(course.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span style={{ color: "#4285F4", fontSize: "1.2rem", flexShrink: 0 }}>→</span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}