import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { assertUploadUrl } from '../app/lib/server/auth'

const read = (p: string) => readFileSync(p, 'utf8')
const files = (dir: string, pattern: RegExp) =>
  (readdirSync(dir, { recursive: true }) as string[]).filter((f) => pattern.test(f)).map((f) => join(dir, f))

const routes = files('app/api', /(^|\/)route\.ts$/)
const handlers = (src: string) => [
  ...[...src.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]),
  ...(src
    .match(/export\s+const\s+\{\s*([A-Z, ]+)\}/)?.[1]
    .split(',')
    .map((s) => s.trim()) ?? []),
]

test('the route list is what this audit expects', () => {
  assert.ok(routes.length >= 14, `found ${routes.length} routes`)
  for (const r of routes) assert.ok(handlers(read(r)).length > 0, `${r} exports no handler`)
})

test('every API route checks who is calling', () => {
  for (const r of routes) {
    const src = read(r)
    assert.ok(/requireUser\(|optionalUser\(/.test(src), `${r} never authenticates the caller`)
  }
})

test('routes that act on one record check that it belongs to the caller', () => {
  for (const r of routes.filter((p) => p.includes('['))) {
    assert.ok(read(r).includes('user.id'), `${r} does not scope the record to the signed-in user`)
  }
  for (const r of ['app/api/synthesize/route.ts', 'app/api/review/route.ts', 'app/api/check-answer/route.ts']) {
    assert.ok(read(r).includes('getOwnCourse('), `${r} does not check lesson ownership`)
  }
})

test('the only unauthenticated paths are the public demo and signed audio', () => {
  const check = read('app/api/check-answer/route.ts')
  // Without a session, only the built-in demo lesson can be graded.
  assert.ok(check.includes('DEMO_LESSON.segments[') && check.includes("'Sign in to continue.'"))
  const speak = read('app/api/speak/route.ts')
  // Audio is generated only for text the server signed, and signing needs a session (or a demo text).
  assert.ok(speak.includes('verifyText(') && speak.includes('DEMO_TEXTS.has('))
  const upload = read('app/api/uploadthing/route.ts')
  assert.ok(upload.includes('.middleware(') && upload.includes('requireUser('))
})

test('server routes only download files that UploadThing hosts', () => {
  for (const r of ['app/api/extract-pdf/route.ts', 'app/api/transcribe/route.ts']) {
    assert.ok(read(r).includes('assertUploadUrl('), `${r} fetches a URL without checking it`)
  }
  for (const ok of [
    'https://abc123.ufs.sh/f/key',
    'https://utfs.io/f/key',
    'https://x.utfs.io/f/key',
    'https://sea1.uploadthing.com/f/key',
  ]) {
    assert.equal(assertUploadUrl(ok), ok)
  }
  for (const bad of [
    'http://utfs.io/f/key',
    'https://evil-uploadthing.com/f/key',
    'https://utfs.io.evil.com/f/key',
    'https://example.com/file.pdf',
    'not a url',
    42,
  ]) {
    assert.throws(
      () => assertUploadUrl(bad),
      (e: { status?: number }) => e.status === 400,
      String(bad),
    )
  }
})

test('only the Supabase URL and anon key are exposed to the browser', () => {
  const used = new Set<string>()
  for (const f of files('app', /\.(ts|tsx)$/)) {
    for (const m of read(f).matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) used.add(m[1])
  }
  assert.deepEqual([...used].sort(), ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL'])
})

test('server modules refuse to be bundled for the browser', () => {
  for (const f of files('app/lib/server', /\.ts$/)) {
    assert.ok(read(f).startsWith("import 'server-only'"), `${f} must start with import 'server-only'`)
  }
  for (const f of files('app', /\.tsx?$/)) {
    const src = read(f)
    if (!/^['"]use client['"]/m.test(src)) continue
    assert.ok(!/from ['"][^'"]*lib\/server\//.test(src), `${f} is a client component importing server code`)
  }
})
