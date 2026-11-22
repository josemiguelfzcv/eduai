// Checks row-level security from the outside, with the public anon key. It never prints row contents.
//
// 1. Anonymous check (safe on production; read-only): no table may return rows to a visitor who isn't signed in.
//      SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run check:rls
//
// 2. Two-user check (STAGING ONLY; writes and then deletes a few probe rows): two test users must not be able to
//    read, change or delete each other's rows, or create rows in each other's name.
//      SUPABASE_URL=… SUPABASE_ANON_KEY=… TEST_A_EMAIL=… TEST_A_PASSWORD=… TEST_B_EMAIL=… TEST_B_PASSWORD=… \
//      npm run check:rls -- --two-users --i-am-on-staging
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (Supabase > Project Settings > API).')
  process.exit(2)
}
const TABLES = ['users', 'courses', 'session_events', 'academy_courses', 'deadlines']
const MISSING = new Set(['42P01', 'PGRST205'])
const client = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const results = []
const report = (check, ok, detail = '') =>
  results.push({ check, result: ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail })

// 1. Visitors see nothing.
const visitor = client()
for (const table of TABLES) {
  const { count, error } = await visitor.from(table).select('*', { count: 'exact', head: true })
  if (error && MISSING.has(error.code)) report(`anonymous read ${table}`, null, 'table does not exist')
  else if (error) report(`anonymous read ${table}`, true, `blocked (${error.code ?? error.message})`)
  else
    report(`anonymous read ${table}`, count === 0, count === 0 ? '0 rows visible' : `${count} rows visible to anyone`)
}

// 2. Two users can't touch each other's rows.
if (process.argv.includes('--two-users')) {
  if (!process.argv.includes('--i-am-on-staging')) {
    console.error('The two-user check writes probe rows. Run it only against staging, with --i-am-on-staging.')
    process.exit(2)
  }
  const signIn = async (who) => {
    const c = client()
    const { data, error } = await c.auth.signInWithPassword({
      email: process.env[`TEST_${who}_EMAIL`],
      password: process.env[`TEST_${who}_PASSWORD`],
    })
    if (error) throw new Error(`Could not sign in test user ${who}: ${error.message}`)
    return { c, id: data.user.id }
  }
  const a = await signIn('A')
  const b = await signIn('B')
  const probes = []
  const make = async (table, row) => {
    const { data, error } = await a.c
      .from(table)
      .insert({ user_id: a.id, ...row })
      .select('id')
      .single()
    if (error) {
      report(`user A creates a ${table} probe`, MISSING.has(error.code) ? null : false, error.message)
      return null
    }
    probes.push([table, data.id])
    return data.id
  }
  const lesson = await make('courses', { title: 'RLS probe', description: 'RLS probe', status: 'extracted' })
  if (lesson)
    await make('session_events', {
      course_id: lesson,
      segment_index: 0,
      question: 'probe',
      answer: 'probe',
      correct: true,
    })
  const course = await make('academy_courses', { name: 'RLS probe' })
  if (course) await make('deadlines', { course_id: course, title: 'RLS probe', kind: 'exam', due_on: '2030-01-01' })

  for (const [table, id] of probes) {
    const read = await b.c.from(table).select('id').eq('id', id)
    report(
      `user B reads A's ${table} row`,
      !read.error && read.data.length === 0,
      read.error?.message ?? `${read.data.length} rows`,
    )
    const upd = await b.c.from(table).update({ user_id: b.id }).eq('id', id).select('id')
    report(
      `user B changes A's ${table} row`,
      !!upd.error || upd.data.length === 0,
      upd.error?.message ?? `${upd.data.length} rows`,
    )
    const del = await b.c.from(table).delete().eq('id', id).select('id')
    report(
      `user B deletes A's ${table} row`,
      !!del.error || del.data.length === 0,
      del.error?.message ?? `${del.data.length} rows`,
    )
  }
  const forged = await b.c
    .from('courses')
    .insert({ user_id: a.id, title: 'forged', description: '', status: 'extracted' })
    .select('id')
  report("user B creates a lesson in A's name", !!forged.error, forged.error?.code ?? 'insert was allowed')
  if (forged.data?.length) probes.push(['courses', forged.data[0].id])
  if (course) {
    const cross = await b.c
      .from('deadlines')
      .insert({ user_id: b.id, course_id: course, title: 'x', kind: 'exam', due_on: '2030-01-01' })
      .select('id')
    report("user B adds a deadline to A's course", !!cross.error, cross.error?.code ?? 'insert was allowed')
    if (cross.data?.length) probes.push(['deadlines', cross.data[0].id])
  }
  for (const [table, id] of probes.reverse()) await a.c.from(table).delete().eq('id', id)
}

console.table(results)
process.exit(results.some((r) => r.result === 'FAIL') ? 1 : 0)
