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

/** An API error with the server's message and HTTP status (503 means My Academy isn't set up yet). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

/** Calls one of Lyceo's API routes with the user's session token. Throws ApiError with the server's message. */
async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`

  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(json.error || `Request failed (${res.status})`, res.status)
  return json as T
}

export const getJSON = <T>(url: string) => request<T>('GET', url)
export const postJSON = <T>(url: string, body: unknown) => request<T>('POST', url, body)
export const patchJSON = <T>(url: string, body: unknown) => request<T>('PATCH', url, body)
export const deleteJSON = <T>(url: string) => request<T>('DELETE', url)
