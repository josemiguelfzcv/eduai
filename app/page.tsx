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
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>StudyAI 🎓</h1>
      <p>Tu profesor de IA personalizado.</p>
      <br />
      <button onClick={loginWithGoogle} style={{
        padding: "12px 24px",
        fontSize: "16px",
        background: "#4285F4",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer"
      }}>
        Sign in with Google
      </button>
    </div>
  )
}