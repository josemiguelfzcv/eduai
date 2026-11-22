// Builds a throwaway database that behaves like a Supabase project (see supabase/tests/supabase_shim.sql), applies the
// staging baseline and every migration, and gives tests a way to act as a visitor, a signed-in student or Lyceo's
// server. Needs TEST_DATABASE_URL: a superuser connection to a local or CI Postgres, never a Supabase project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'

export type Sql = postgres.Sql
export type Tx = postgres.TransactionSql

const ROOT = join(import.meta.dirname, '..', '..')
export const MIGRATIONS = readdirSync(join(ROOT, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => join(ROOT, 'supabase', 'migrations', f))
const SHIM = join(ROOT, 'supabase', 'tests', 'supabase_shim.sql')
const BASELINE = join(ROOT, 'supabase', 'staging', '0000_baseline.sql')

export const TEST_URL = process.env.TEST_DATABASE_URL
export const skipReason = TEST_URL
  ? false
  : 'Set TEST_DATABASE_URL to a local Postgres superuser to run database tests.'

function withUser(url: string, user: string, password: string, database?: string) {
  const u = new URL(url)
  u.username = user
  u.password = password
  if (database) u.pathname = `/${database}`
  return u.toString()
}

const quiet = { onnotice: () => {} }

export type TestDb = {
  name: string
  /** Superuser connection to the test database. */
  admin: Sql
  /** A connection that logs in as lyceo_server, like the app server does. */
  server: Sql
  /** Connection string for lyceo_server, for code that opens its own connection. */
  serverUrl: string
  close: () => Promise<void>
}

export async function createTestDb(): Promise<TestDb> {
  if (!TEST_URL) throw new Error('TEST_DATABASE_URL is not set')
  const name = `lyceo_test_${randomBytes(4).toString('hex')}`
  const root = postgres(TEST_URL, { max: 1, ...quiet })
  await root.unsafe(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'migrator') then
      create role migrator login createrole bypassrls password 'migrator';
    end if; end $$;`)
  await root.unsafe(`create database ${name} owner migrator`)
  await root.end()

  const admin = postgres(
    withUser(TEST_URL, new URL(TEST_URL).username, decodeURIComponent(new URL(TEST_URL).password), name),
    {
      max: 10,
      ...quiet,
    },
  )
  await admin.unsafe(readFileSync(SHIM, 'utf8'))

  const migrator = postgres(withUser(TEST_URL, 'migrator', 'migrator', name), { max: 1, ...quiet })
  for (const file of [BASELINE, ...MIGRATIONS]) {
    try {
      await migrator.unsafe(readFileSync(file, 'utf8'))
    } catch (err) {
      throw new Error(`${file}: ${(err as Error).message}`)
    }
  }
  await migrator.end()

  // Locally only: give the server role a password so tests can log in as it.
  await admin.unsafe(`alter role lyceo_server with login password 'lyceo-test'`)
  const serverUrl = withUser(TEST_URL, 'lyceo_server', 'lyceo-test', name)
  const server = postgres(serverUrl, { max: 20, ...quiet })

  return {
    name,
    admin,
    server,
    serverUrl,
    close: async () => {
      await server.end()
      await admin.end()
      const cleanup = postgres(TEST_URL, { max: 1, ...quiet })
      await cleanup.unsafe(`drop database if exists ${name} with (force)`)
      await cleanup.end()
    },
  }
}

export type Who =
  { role: 'anon' } | { role: 'authenticated'; sub: string; signedInSecondsAgo?: number } | { role: 'service_role' }

/** Runs `fn` the way PostgREST would for this caller: inside a transaction, as the API role, with the JWT claims set. */
export async function as<T>(db: TestDb, who: Who, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims =
    who.role === 'authenticated'
      ? {
          sub: who.sub,
          role: 'authenticated',
          aal: 'aal1',
          amr: [{ method: 'oauth', timestamp: Math.floor(Date.now() / 1000) - (who.signedInSecondsAgo ?? 60) }],
        }
      : { role: who.role }
  return db.admin.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`
    await tx.unsafe(`set local role ${who.role}`)
    return fn(tx)
  }) as Promise<T>
}

/** The Postgres error code `fn` fails with, or null if it succeeds. */
export async function errorCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (err) {
    return (err as { code?: string }).code ?? 'unknown'
  }
}

export async function makeUser(db: TestDb, email: string): Promise<string> {
  const [row] = await db.admin`insert into auth.users (email) values (${email}) returning id`
  await db.admin`insert into public.users (id, email, name) values (${row.id}, ${email}, ${email})`
  return row.id as string
}
