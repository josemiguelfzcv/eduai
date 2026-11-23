'use client'

import { ApiError, supabase } from '../../lib/supabase'

/**
 * POSTs with the student's session and reads a text answer as it streams, calling `onText` with everything so far.
 * A JSON answer (already written) is passed through whole. Resolves with the full text.
 */
export async function postStream(
  url: string,
  body: unknown,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    const problem = type.includes('json') ? await res.json().catch(() => null) : null
    throw new ApiError(problem?.error ?? 'Something went wrong. Try again.', res.status)
  }
  if (type.includes('json')) {
    const { content } = (await res.json()) as { content: string }
    onText(content)
    return content
  }
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    onText(text)
  }
  text += decoder.decode()
  if (!text.trim()) throw new ApiError('Lyceo didn’t finish writing. Try again.', 502)
  return text
}

/** PUT with the student's session, kept alive while the page closes. */
export async function putKeepalive(url: string, body: unknown) {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  await fetch(url, {
    method: 'PUT',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body),
  }).catch(() => {})
}
