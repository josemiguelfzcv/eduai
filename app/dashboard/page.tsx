'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUser(data.user)

        // Guarda el usuario en la tabla users si no existe
        await supabase.from('users').upsert({
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name,
        })
      }
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