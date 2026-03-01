'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>StudyAI 🎓</h1>
      {user ? (
        <>
          <p>Bienvenido, <strong>{user.email}</strong> 👋</p>
          <p>Aquí van tus cursos pronto.</p>
        </>
      ) : (
        <p>Cargando...</p>
      )}
    </div>
  )
}