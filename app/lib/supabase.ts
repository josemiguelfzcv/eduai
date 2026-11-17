import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/dashboard` },
  })
}

/** POSTs JSON to one of Lyceo's API routes with the user's session token. Throws with the server's message. */
export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json as T
}

export async function getJSON<T>(url: string): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const headers: Record<string, string> = {}
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`

  const res = await fetch(url, { headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json as T
}
