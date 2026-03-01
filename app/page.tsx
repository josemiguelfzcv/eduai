import { supabase } from './lib/supabase'

export default async function Home() {
  const { data, error } = await supabase.from('users').select('*')

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>StudyAI 🎓</h1>
      <p>Conexión con Supabase:</p>
      {error ? (
        <p style={{ color: "red" }}>❌ {error.message}</p>
      ) : (
        <p style={{ color: "green" }}>✅ Conectado correctamente</p>
      )}
    </div>
  )
}