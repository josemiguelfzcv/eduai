// Verifies on the real STAGING project what tests/db proves on a local copy: students can't reach usage records,
// answer keys or anything in schema private; the server role can only call its functions; limits hold under
// concurrent requests; private uploads are scoped, validated and deletable; account deletion works and only deletes
// the caller. Prints PASS/FAIL per check and never prints row contents (this runs in a public repository's logs).
//
//   npm run check:staging -- --i-am-on-staging [--delete-test-user-c]
//
// Env: STAGING_SUPABASE_URL, STAGING_SUPABASE_PUBLISHABLE_KEY, PRODUCTION_SUPABASE_REF,
//      TEST_A_EMAIL, TEST_A_PASSWORD, TEST_B_EMAIL, TEST_B_PASSWORD (two staging test users),
//      STAGING_SERVER_DATABASE_URL (lyceo_server; optional), LYCEO_MATERIALS_* and STAGING_APP_ORIGIN (optional),
//      TEST_C_EMAIL, TEST_C_PASSWORD (a disposable user, only with --delete-test-user-c: it gets deleted).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { GetBucketLifecycleConfigurationCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import postgres from 'postgres'

type Result = { check: string; result: 'PASS' | 'FAIL' | 'SKIP'; detail: string }
const results: Result[] = []
const report = (check: string, ok: boolean | null, detail = '') =>
  results.push({ check, result: ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail })
const env = (name: string) => process.env[name]?.trim() || undefined
const code = (err: unknown) =>
  (err as { code?: string })?.code ?? (err as { message?: string })?.message?.slice(0, 60) ?? 'error'

if (!process.argv.includes('--i-am-on-staging')) {
  console.error('This writes probe rows and files. Run it only against staging, with --i-am-on-staging.')
  process.exit(2)
}
const url = env('STAGING_SUPABASE_URL')
const key = env('STAGING_SUPABASE_PUBLISHABLE_KEY')
const productionRef = env('PRODUCTION_SUPABASE_REF')
if (!url || !key || !productionRef) {
  console.error('Set STAGING_SUPABASE_URL, STAGING_SUPABASE_PUBLISHABLE_KEY and PRODUCTION_SUPABASE_REF.')
  process.exit(2)
}
if (url.includes(productionRef)) {
  console.error('STAGING_SUPABASE_URL is the production project. Nothing was run.')
  process.exit(3)
}
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function signIn(who: 'A' | 'B' | 'C') {
  const c = client()
  const { data, error } = await c.auth.signInWithPassword({
    email: env(`TEST_${who}_EMAIL`)!,
    password: env(`TEST_${who}_PASSWORD`)!,
  })
  if (error || !data.user) throw new Error(`test user ${who} could not sign in (${error?.message})`)
  return { c, id: data.user.id }
}

async function dataApi(a: { c: SupabaseClient; id: string }, b: { c: SupabaseClient; id: string }) {
  const visitor = client()
  for (const table of [
    'users',
    'courses',
    'session_events',
    'academy_courses',
    'deadlines',
    'materials',
    'skills',
    'skill_sources',
    'study_sessions',
  ]) {
    // GET, not HEAD: a HEAD response has no body, so the client can't report the error code, and it turns an empty 404
    // into "no error".
    const { count, error } = await visitor.from(table).select('*', { count: 'exact' }).limit(1)
    report(`visitor reads ${table}`, !!error || count === 0, error ? `blocked (${error.code})` : `${count} rows`)
  }
  for (const [who, c] of [
    ['visitor', visitor],
    ['student', a.c],
  ] as const) {
    for (const table of ['ai_usage', 'item_keys', 'usage_days', 'usage_limits', 'account_deletions']) {
      const inPublic = await c.from(table).select('*').limit(1)
      const inPrivate = await c.schema('private').from(table).select('*').limit(1)
      report(
        `${who} can't reach ${table}`,
        !!inPublic.error && !!inPrivate.error,
        `${inPublic.error?.code} / ${inPrivate.error?.code}`,
      )
    }
    const rpc = await c.schema('private').rpc('usage_reserve', {
      p_user: a.id,
      p_task: 'x',
      p_provider: 'anthropic',
      p_model: 'x',
      p_estimate_usd: 0,
      p_price_version: 'x',
    })
    report(`${who} can't call private functions`, !!rpc.error, rpc.error?.code ?? 'call succeeded')
  }

  // Materials: name and file only.
  const forged = await a.c
    .from('materials')
    .insert({ kind: 'pdf', title: 'probe', storage_key: `materials/${a.id}/1` })
    .select('id')
  report('student sets a storage key', !!forged.error, forged.error?.code ?? 'insert was allowed')
  const made = await a.c.from('materials').insert({ kind: 'pdf', title: 'probe' }).select('id').single()
  report('student creates a material', !made.error, made.error?.code ?? '')
  if (made.data) {
    const status = await a.c.from('materials').update({ status: 'mapped' }).eq('id', made.data.id).select('id')
    report(
      'student changes a material status',
      !!status.error || !status.data?.length,
      status.error?.code ?? `${status.data?.length} rows`,
    )
    const del = await a.c.from('materials').delete().eq('id', made.data.id).select('id')
    report(
      'student deletes a material directly',
      !!del.error || !del.data?.length,
      del.error?.code ?? `${del.data?.length} rows`,
    )
    const theirs = await b.c.from('materials').select('id').eq('id', made.data.id)
    report(
      'another student reads it',
      !theirs.error && (theirs.data ?? []).length === 0,
      theirs.error?.code ?? `${theirs.data?.length} rows`,
    )
  }

  // Evidence can't be forged.
  const evidence = await a.c
    .from('session_events')
    .insert({ user_id: a.id, study_session_id: 1, verdict: 'correct', correct: true, attempt_mode: 'independent' })
    .select('id')
  report('student forges study-session evidence', !!evidence.error, evidence.error?.code ?? 'insert was allowed')

  // The skill map stays inside each student's own courses.
  const course = await a.c.from('academy_courses').insert({ name: 'Staging probe' }).select('id').single()
  if (course.data) {
    const skill = await a.c
      .from('skills')
      .insert({ academy_course_id: course.data.id, name: 'Probe skill' })
      .select('id')
      .single()
    const intrude = await b.c
      .from('skills')
      .insert({ academy_course_id: course.data.id, name: 'Intruder' })
      .select('id')
    report('another student adds a skill to it', !!intrude.error, intrude.error?.code ?? 'insert was allowed')
    const read = await b.c
      .from('skills')
      .select('id')
      .eq('id', skill.data?.id ?? 0)
    report(
      'another student reads the skill',
      !read.error && (read.data ?? []).length === 0,
      read.error?.code ?? `${read.data?.length} rows`,
    )
  }
  return { materialId: made.data?.id as number | undefined, courseId: course.data?.id as number | undefined }
}

async function serverRole(
  a: { c: SupabaseClient; id: string },
  b: { id: string },
  probes: { materialId?: number; courseId?: number },
) {
  const dbUrl = env('STAGING_SERVER_DATABASE_URL')
  if (!dbUrl) return report('server role', null, 'STAGING_SERVER_DATABASE_URL not set')
  const sql = postgres(dbUrl, { prepare: false, max: 12, onnotice: () => {}, connect_timeout: 15 })
  try {
    const [{ user }] = await sql`select current_user as user`
    report('server logs in as lyceo_server', user === 'lyceo_server', user)
    for (const [label, query] of [
      ['server reads usage rows directly', sql`select * from private.ai_usage limit 1`],
      ['server reads student tables directly', sql`select * from public.users limit 1`],
      ['server changes limits', sql`update private.usage_limits set daily_usd = 1000`],
    ] as const) {
      report(
        label,
        await query.then(
          () => false,
          (e) => code(e) === '42501',
        ),
        'expects permission denied',
      )
    }

    const [{ id }] =
      await sql`select private.usage_reserve(${a.id}::uuid, 'staging-check', 'anthropic', 'probe', 0.0001, 'check') as id`
    const [{ settled }] = await sql`select private.usage_settle(${id}::bigint, true, 0.0001) as settled`
    const [{ again }] = await sql`select private.usage_settle(${id}::bigint, true, 0.0001) as again`
    report('reserve and settle once', settled === true && again === false, '')

    const burst = await Promise.allSettled(
      Array.from(
        { length: 12 },
        () =>
          sql`select private.usage_reserve(${b.id}::uuid, 'staging-check', 'anthropic', 'probe', 0.0001, 'check') as id`,
      ),
    )
    const won = burst.flatMap((r) => (r.status === 'fulfilled' ? [r.value[0].id] : []))
    const others = burst.flatMap((r) => (r.status === 'rejected' ? [code(r.reason)] : []))
    report(
      '12 concurrent calls: at most 4 run',
      won.length <= 4 && others.every((c) => c === 'LY003'),
      `${won.length} ran, others ${[...new Set(others)].join(',')}`,
    )
    for (const w of won) await sql`select private.usage_settle(${w}::bigint, true, 0.0001)`

    if (probes.courseId) {
      const skill = await a.c.from('skills').select('id').eq('academy_course_id', probes.courseId).limit(1).single()
      const [{ id: session }] =
        await sql`select private.session_start(${a.id}::uuid, ${probes.courseId}::bigint, 'quick_check', ${[skill.data!.id]}::bigint[], 'check') as id`
      const items = [
        {
          id: 'q1',
          type: 'question',
          skill_id: skill.data!.id,
          difficulty: 1,
          facet: 'procedural',
          public: { prompt: 'probe' },
          key: { accepted: ['0.4242'], solution: 'probe-solution' },
        },
      ]
      await sql`select private.session_add_items(${a.id}::uuid, ${session}::bigint, ${sql.json(items as never)})`
      const seen = await a.c.from('study_sessions').select('items').eq('id', session).single()
      const text = JSON.stringify(seen.data?.items ?? '')
      report(
        'student sees the question, not the key',
        text.includes('probe') && !text.includes('0.4242') && !text.includes('probe-solution'),
        '',
      )
      const keys = await a.c.schema('private').from('item_keys').select('*')
      report('student reads answer keys', !!keys.error, keys.error?.code ?? 'readable')
      const [{ id: event }] =
        await sql`select private.record_attempt(${a.id}::uuid, ${session}::bigint, 'q1', ${sql.json({ answer: '0.4242', verdict: 'correct', grader: 'rule', grader_version: 'check' } as never)}) as id`
      const row = await a.c.from('session_events').select('attempt_mode').eq('id', event).single()
      report(
        'first unaided answer is independent',
        row.data?.attempt_mode === 'independent',
        row.data?.attempt_mode ?? '',
      )
      const edit = await a.c.from('session_events').update({ verdict: 'incorrect' }).eq('id', event).select('id')
      report(
        'student edits server-written evidence',
        !!edit.error || !edit.data?.length,
        edit.error?.code ?? `${edit.data?.length} rows`,
      )
      await a.c.from('academy_courses').delete().eq('id', probes.courseId)
    }
    if (probes.materialId) await sql`select private.material_forget(${a.id}::uuid, ${probes.materialId}::bigint)`
  } catch (err) {
    report('server role checks', false, code(err))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function storage(userId: string) {
  const bucket = env('LYCEO_MATERIALS_BUCKET')
  const endpoint = env('LYCEO_MATERIALS_R2_ENDPOINT')
  const accessKeyId = env('LYCEO_MATERIALS_R2_ACCESS_KEY_ID')
  const secretAccessKey = env('LYCEO_MATERIALS_R2_SECRET_ACCESS_KEY')
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey)
    return report('private storage', null, 'LYCEO_MATERIALS_* not set')
  const materials = await import('../app/lib/server/materials')
  // The app's own client settings, so this signs uploads exactly the way the app does.
  const s3 = materials.r2Client(endpoint, accessKeyId, secretAccessKey)
  const pdf = new Uint8Array(4096)
  pdf.set(new TextEncoder().encode('%PDF-1.7\n'))
  const id = 999_000_000 + Math.floor(Math.random() * 999_999)
  const key = materials.incomingKey(userId, id)
  const sign = (k: string, type: string, bytes: number, expiresIn = 600) =>
    getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: k, ContentType: type, ContentLength: bytes }), {
      expiresIn,
      signableHeaders: new Set(['content-type', 'content-length']),
    })
  const put = (u: string, type: string, body: Uint8Array) =>
    fetch(u, { method: 'PUT', headers: { 'Content-Type': type }, body: body as BodyInit })

  const anonymous = await fetch(`${endpoint.replace(/\/$/, '')}/${bucket}/${key}`)
  report('bucket refuses unsigned reads', [400, 401, 403].includes(anonymous.status), String(anonymous.status))
  const signed = await sign(key, 'application/pdf', pdf.length)
  report('upload with another content type', (await put(signed, 'text/html', pdf)).status === 403, '')
  report(
    'upload of another size',
    (await put(signed, 'application/pdf', new Uint8Array(pdf.length * 2))).status === 403,
    '',
  )
  const other = new URL(signed)
  other.pathname = other.pathname.replace(String(id), String(id + 1))
  report('signed URL used for another key', (await put(other.toString(), 'application/pdf', pdf)).status === 403, '')
  const short = await sign(key, 'application/pdf', pdf.length, 1)
  await new Promise((r) => setTimeout(r, 2500))
  report('expired signed URL', (await put(short, 'application/pdf', pdf)).status === 403, '')
  report('exact upload succeeds', (await put(signed, 'application/pdf', pdf)).ok, '')

  const accepted = await materials.finishUpload(userId, id, pdf.length)
  report('a real PDF is accepted and moved', accepted.ok, accepted.ok ? '' : accepted.reason)
  const fakeId = id + 2
  const fakeKey = materials.incomingKey(userId, fakeId)
  const fakeBody = new TextEncoder().encode('MZ not a pdf at all, padded to look normal..........')
  await put(await sign(fakeKey, 'application/pdf', fakeBody.length), 'application/pdf', fakeBody)
  const rejected = await materials.finishUpload(userId, fakeId, fakeBody.length)
  report('a fake PDF is rejected', !rejected.ok, rejected.ok ? 'accepted' : '')

  const origin = env('STAGING_APP_ORIGIN')
  if (origin) {
    const preflight = (o: string) =>
      fetch(signed, {
        method: 'OPTIONS',
        headers: {
          Origin: o,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type',
        },
      })
    const allowed = (await preflight(origin)).headers.get('access-control-allow-origin')
    const evil = (await preflight('https://evil.example')).headers.get('access-control-allow-origin')
    report('CORS allows the app', allowed === origin || allowed === '*', allowed ?? 'none')
    report('CORS refuses other sites', !evil || evil === origin, evil ?? 'none')
  } else report('CORS', null, 'STAGING_APP_ORIGIN not set')

  try {
    const lifecycle = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
    const rule = lifecycle.Rules?.find((r) => r.Status === 'Enabled' && (r.Filter?.Prefix ?? r.Prefix) === 'incoming/')
    report(
      'abandoned uploads expire',
      !!rule && (rule.Expiration?.Days ?? 99) <= 2,
      rule ? `${rule.Expiration?.Days} days` : 'no rule for incoming/',
    )
  } catch (err) {
    // The app's token reaches only the objects in its bucket, and R2 counts lifecycle rules as bucket settings, which
    // need an account-wide admin token. A refusal is therefore expected: the rule is checked in the dashboard instead.
    const denied =
      (err as { name?: string })?.name === 'AccessDenied' ||
      (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 403
    report(
      'abandoned uploads expire',
      denied ? null : false,
      denied ? 'the bucket-scoped token cannot read bucket settings; check the rule in the dashboard' : code(err),
    )
  }
  const removed = await materials.deleteAllFilesOf(userId)
  report("deleting a student's files", removed >= 1, `${removed} removed`)
}

async function accountDeletion(a: { id: string }) {
  if (!process.argv.includes('--delete-test-user-c'))
    return report('account deletion', null, 'run with --delete-test-user-c')
  const c = await signIn('C')
  await c.c.from('academy_courses').insert({ name: 'Doomed' })
  const { error } = await c.c.rpc('delete_my_account')
  report('a student deletes their own account', !error, error?.code ?? '')
  const again = await client().auth.signInWithPassword({
    email: env('TEST_C_EMAIL')!,
    password: env('TEST_C_PASSWORD')!,
  })
  report('the deleted account can no longer sign in', !!again.error, again.error?.message?.slice(0, 40) ?? 'signed in')
  const stillThere = await signIn('A').then(
    (x) => x.id === a.id,
    () => false,
  )
  report('other accounts are untouched', stillThere, '')
}

async function main() {
  const a = await signIn('A')
  const b = await signIn('B')
  const probes = await dataApi(a, b)
  await serverRole(a, b, probes)
  await storage(a.id)
  await accountDeletion(a)
}

main()
  .catch((err) => report('staging check', false, String((err as Error).message).slice(0, 120)))
  .finally(() => {
    console.table(results)
    process.exit(results.some((r) => r.result === 'FAIL') ? 1 : 0)
  })
