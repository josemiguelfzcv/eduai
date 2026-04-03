'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUser(data.user)
        await supabase.from('users').upsert({
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name,
        })
      }
    })
  }, [])

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <h1>StudyAI 🎓</h1>
      {user ? (
        <>
          <p>Bienvenido, <strong>{user.email}</strong> 👋</p>
          <br />
          <a href="/upload" style={{
            display: "inline-block",
            padding: "14px 28px",
            background: "#4285F4",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: "600",
            fontSize: "16px"
          }}>
            + Nueva clase
          </a>
        </>
      ) : (
        <p>Cargando...</p>
      )}
    </div>
  )
}