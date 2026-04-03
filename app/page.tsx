'use client'

import { supabase } from './lib/supabase'

export default function Home() {
  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/dashboard'
      }
    })
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px",
      textAlign: "center"
    }}>
      <div style={{
        background: "linear-gradient(135deg, #4285F4, #34a853)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        fontSize: "3.5rem",
        fontWeight: 800,
        marginBottom: "16px"
      }}>
        StudyAI
      </div>
      <p style={{ fontSize: "1.1rem", marginBottom: "8px", color: "#8b92a5" }}>
        El profesor que aprende cómo aprendes tú
      </p>
      <p style={{ fontSize: "0.9rem", marginBottom: "40px", color: "#555e7a", maxWidth: "400px" }}>
        Sube tus apuntes, slides y grabaciones — recibe una clase personalizada con IA
      </p>
      <button onClick={loginWithGoogle} style={{
        padding: "14px 32px",
        background: "linear-gradient(135deg, #4285F4, #34a853)",
        color: "white",
        border: "none",
        borderRadius: "12px",
        fontSize: "1rem",
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: "0 4px 24px rgba(66,133,244,0.3)"
      }}>
        Entrar con Google →
      </button>
    </div>
  )
}