// Applies Lyceo's migrations to the STAGING database, in order, once each.
//
//   STAGING_DATABASE_URL=postgresql://postgres.<staging-ref>:<password>@<pooler-host>:5432/postgres \
//   PRODUCTION_SUPABASE_REF=<production-ref> \
//   node scripts/db/migrate.mjs --i-am-on-staging [--dry-run]
//
// --local (with a localhost URL) is for trying it on a local Postgres prepared with supabase/tests/supabase_shim.sql.
//
// It refuses to run against production: PRODUCTION_SUPABASE_REF must be set, and the connection string must point at
// a different project. A fresh staging project also gets supabase/staging/0000_baseline.sql, the tables production had
// before these migrations. Applied files are recorded with their SHA-256 in private.schema_migrations; a file that
// changed after it was applied stops the run (write a new migration instead). Prints file names only, never data.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const fail = (message, code = 2) => {
  console.error(message)
  process.exit(code)
}

if (!args.has('--i-am-on-staging'))
  fail('This writes to a database. Run it only against staging, with --i-am-on-staging.')
const url = process.env.STAGING_DATABASE_URL
const productionRef = process.env.PRODUCTION_SUPABASE_REF?.trim()
if (!url) fail('Set STAGING_DATABASE_URL (staging project > Connect > Session pooler).')
const local = args.has('--local') && ['localhost', '127.0.0.1'].includes(new URL(url).hostname)
if (!productionRef && !local) fail('Set PRODUCTION_SUPABASE_REF, so this script can refuse to touch production.')

export function projectRef(connectionString) {
  const u = new URL(connectionString)
  const fromUser = decodeURIComponent(u.username).match(/^[a-z_]+\.([a-z0-9]{20})$/)?.[1]
  const fromHost = u.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)?.[1]
  return fromUser ?? fromHost ?? null
}

const ref = local ? 'local' : projectRef(url)
if (!ref) fail('Could not read the project ref from STAGING_DATABASE_URL. Copy it from the Supabase Connect dialog.')
if (!local && (ref === productionRef || url.includes(productionRef))) {
  fail('STAGING_DATABASE_URL points at PRODUCTION. Nothing was run.', 3)
}

const root = join(import.meta.dirname, '..', '..')
const baseline = join(root, 'supabase', 'staging', '0000_baseline.sql')
const migrations = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort()
  .map((f) => join(root, 'supabase', 'migrations', f))
const sha = (text) => createHash('sha256').update(text).digest('hex')

const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 15 })
try {
  await sql.unsafe(`create schema if not exists private;
    create table if not exists private.schema_migrations (
      name text primary key, sha256 text not null, applied_at timestamptz not null default now());
    revoke all on private.schema_migrations from public;`)
  const applied = new Map(
    (await sql`select name, sha256 from private.schema_migrations`).map((r) => [r.name, r.sha256]),
  )
  const [{ exists: hasCourses }] = await sql`select to_regclass('public.courses') is not null as exists`

  const plan = []
  if (!hasCourses && !applied.has('0000_baseline.sql')) plan.push(['0000_baseline.sql', baseline])
  for (const file of migrations) {
    const name = file.split('/').pop()
    const text = readFileSync(file, 'utf8')
    if (applied.has(name)) {
      if (applied.get(name) !== sha(text))
        fail(`${name} changed after it was applied to staging. Add a new migration instead.`, 4)
      console.log(`  skip   ${name} (already applied)`)
    } else plan.push([name, file])
  }
  if (!plan.length) console.log(`Staging (${ref}) is up to date.`)
  for (const [name, file] of plan) {
    if (dryRun) {
      console.log(`  would apply ${name}`)
      continue
    }
    const text = readFileSync(file, 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(text)
      await tx`insert into private.schema_migrations (name, sha256) values (${name}, ${sha(text)})`
    })
    console.log(`  applied ${name}`)
  }
  if (dryRun && plan.length) console.log(`Dry run: nothing was applied to staging (${ref}).`)
} catch (err) {
  // Postgres messages name the statement, not the data.
  fail(`Migration failed: ${err.message}`, 1)
} finally {
  await sql.end({ timeout: 5 })
}
