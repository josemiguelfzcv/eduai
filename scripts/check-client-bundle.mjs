// Fails if a server secret ended up in what the browser downloads.
// Run after `next build` with every secret set to a unique fake value (CI does this), so a leak shows up as that
// exact string in the client bundle or in a prerendered page.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SECRETS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'UPLOADTHING_TOKEN',
  'LYCEO_TTS_SECRET',
  'LYCEO_SERVER_DATABASE_URL',
  'LYCEO_MATERIALS_R2_ACCESS_KEY_ID',
  'LYCEO_MATERIALS_R2_SECRET_ACCESS_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]
const PLACES = [
  ['.next/static', /\.(js|css|json|txt|map)$/],
  ['.next/server/app', /\.(html|rsc|body|meta)$/],
]

if (!existsSync('.next/static')) {
  console.error('No build found. Run `npm run build` first.')
  process.exit(2)
}
const secrets = SECRETS.map((name) => [name, process.env[name]]).filter(([, value]) => value && value.length >= 12)
if (!secrets.length) {
  console.error('Set the secret env vars to unique fake values (12+ characters) before building, then run this again.')
  process.exit(2)
}

const leaks = []
let scanned = 0
for (const [dir, pattern] of PLACES) {
  if (!existsSync(dir)) continue
  for (const file of readdirSync(dir, { recursive: true })) {
    if (!pattern.test(file)) continue
    scanned++
    const text = readFileSync(join(dir, file), 'utf8')
    for (const [name, value] of secrets) if (text.includes(value)) leaks.push(`${name} found in ${join(dir, file)}`)
  }
}
if (leaks.length) {
  console.error(`Secret values reached the browser:\n${leaks.join('\n')}`)
  process.exit(1)
}
console.log(`No secrets in ${scanned} client files (checked ${secrets.map(([n]) => n).join(', ')}).`)
