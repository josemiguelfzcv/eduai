import 'server-only'
import postgres from 'postgres'

// Lyceo's own connection to Postgres, as the lyceo_server role (supabase/migrations/0003_trusted_server.sql). It can
// only call the functions in schema private: record usage, keep answer keys, write study-session evidence. Students
// never see this connection or its credentials; everything they do still goes through Supabase as themselves.
//
// LYCEO_SERVER_DATABASE_URL is set on staging only for now. Without it the app behaves exactly as it does on main.

let client: postgres.Sql | null = null

export function trustedDbConfigured() {
  return Boolean(process.env.LYCEO_SERVER_DATABASE_URL)
}

export function trustedDb(): postgres.Sql | null {
  const url = process.env.LYCEO_SERVER_DATABASE_URL
  if (!url) return null
  client ??= postgres(url, {
    // Supabase's transaction pooler doesn't keep prepared statements between transactions.
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { application_name: 'lyceo-server' },
    onnotice: () => {},
  })
  return client
}

/** Closes the connection (tests, scripts). */
export async function closeTrustedDb() {
  const c = client
  client = null
  await c?.end({ timeout: 5 })
}

/** The Postgres error code of a failed query, if it has one. */
export function pgCode(err: unknown): string | null {
  return typeof err === 'object' && err && 'code' in err && typeof err.code === 'string' ? err.code : null
}
