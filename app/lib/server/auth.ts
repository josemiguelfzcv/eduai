import 'server-only'
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** A Supabase client that acts as the signed-in user, so row-level security applies. */
function clientFor(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function bearer(req: Request) {
  return (
    req.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
      .trim() || null
  )
}

export async function requireUser(req: Request): Promise<{ user: User; db: SupabaseClient }> {
  const token = bearer(req)
  if (!token) throw new HttpError(401, 'Sign in to continue.')
  const db = clientFor(token)
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your session expired. Sign in again.')
  return { user: data.user, db }
}

/** Like requireUser, but returns null when the request has no session (used by the public demo). */
export async function optionalUser(req: Request) {
  return bearer(req) ? requireUser(req) : null
}

export function errorResponse(err: unknown, fallback: string) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status })
  console.error(err)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

/** Only fetch files that UploadThing hosts, so the server can't be pointed at arbitrary URLs. */
export function assertUploadUrl(fileUrl: unknown): string {
  if (typeof fileUrl !== 'string') throw new HttpError(400, 'Missing file.')
  let url: URL
  try {
    url = new URL(fileUrl)
  } catch {
    throw new HttpError(400, 'That file link is not valid.')
  }
  const host = url.hostname
  const allowed =
    host.endsWith('.ufs.sh') ||
    host === 'utfs.io' ||
    host.endsWith('.utfs.io') ||
    host === 'uploadthing.com' ||
    host.endsWith('.uploadthing.com')
  if (url.protocol !== 'https:' || !allowed) throw new HttpError(400, 'Files must be uploaded through Lyceo.')
  return url.toString()
}
