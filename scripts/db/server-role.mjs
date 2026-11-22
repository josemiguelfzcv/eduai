// Prints what's needed to let Lyceo's server log in as lyceo_server on STAGING, without the password ever being stored
// in the repository or sent to the database in the clear.
//
//   node scripts/db/server-role.mjs --ref <staging-ref> --host <pooler-host>
//
// 1. Paste the printed SQL into the staging SQL editor and run it. It stores only a SCRAM-SHA-256 verifier.
// 2. Save the printed connection string as LYCEO_SERVER_DATABASE_URL (Vercel, Preview) and as STAGING_SERVER_DATABASE_URL
//    (GitHub, environment "staging"). Then close the terminal: the password isn't kept anywhere else.
// Run it again any time to rotate the password; the old one stops working as soon as the SQL runs.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
const ref = arg('ref')
const host = arg('host')
if (!ref || !/^[a-z0-9]{20}$/.test(ref) || !host || !/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(host)) {
  console.error(
    'Usage: node scripts/db/server-role.mjs --ref <staging project ref> --host <aws-...pooler.supabase.com>',
  )
  console.error('Both are in the staging project: Connect > Transaction pooler.')
  process.exit(2)
}

export function scramVerifier(password, salt = randomBytes(16), iterations = 4096) {
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest()
  const serverKey = createHmac('sha256', salted).update('Server Key').digest()
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

const password = randomBytes(32).toString('base64url')
console.log(`\n-- 1. Run in the STAGING SQL editor (${ref}):`)
console.log(`alter role lyceo_server with login password '${scramVerifier(password)}' valid until 'infinity';\n`)
console.log(
  '# 2. Save as LYCEO_SERVER_DATABASE_URL (Vercel > Preview) and STAGING_SERVER_DATABASE_URL (GitHub > staging):',
)
console.log(`postgresql://lyceo_server.${ref}:${password}@${host}:6543/postgres?sslmode=require\n`)
