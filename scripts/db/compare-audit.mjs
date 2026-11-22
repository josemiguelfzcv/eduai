// Compares two results of supabase/checks/rls_audit.sql (for example production against the staging baseline) and
// flags security problems in the second one. Reads files only; never connects to a database.
//
//   node scripts/db/compare-audit.mjs <expected.json> <actual.json> [--schema public]
//
// Each file can be the JSON itself, or what the Supabase SQL editor exports (Download CSV, Copy as JSON).
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--schema')
const schema = args.includes('--schema') ? args[args.indexOf('--schema') + 1] : null
if (files.length !== 2) {
  console.error('Usage: node scripts/db/compare-audit.mjs <expected.json> <actual.json> [--schema public]')
  process.exit(2)
}

/** The audit object, from raw JSON, a JSON export ([{"audit": "..."}]) or a one-cell CSV export. */
export function loadAudit(text) {
  const tryParse = (t) => {
    try {
      return JSON.parse(t)
    } catch {
      return undefined
    }
  }
  const unwrap = (v) => {
    if (typeof v === 'string') return unwrap(tryParse(v))
    if (Array.isArray(v)) return unwrap(v[0])
    if (v && typeof v === 'object' && !('tables' in v)) return unwrap(Object.values(v)[0])
    return v
  }
  let value = unwrap(tryParse(text.trim()))
  if (!value) {
    // CSV: a header line, then one quoted cell with doubled quotes inside.
    const body = text.slice(text.indexOf('\n') + 1).trim()
    const cell = body.startsWith('"') ? body.slice(1, body.lastIndexOf('"')).replace(/""/g, '"') : body
    value = unwrap(tryParse(cell))
  }
  if (!value) value = unwrap(tryParse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)))
  if (!value?.tables) throw new Error('This file does not contain a result of rls_audit.sql')
  return value
}

const [expected, actual] = files.map((f) => loadAudit(readFileSync(f, 'utf8')))
const inScope = (name) => !schema || String(name).startsWith(`${schema}.`) || String(name).startsWith(`${schema}(`)
const norm = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : JSON.stringify(v ?? null))
const out = []
const say = (line = '') => out.push(line)

/** Compares two lists of records keyed by `key`, field by field. */
function diff(title, a, b, key, fields) {
  const index = (list) => new Map((list ?? []).filter((r) => inScope(key(r).split('|')[0])).map((r) => [key(r), r]))
  const ea = index(a)
  const eb = index(b)
  const lines = []
  for (const k of ea.keys()) if (!eb.has(k)) lines.push(`  only in expected: ${k}`)
  for (const k of eb.keys()) if (!ea.has(k)) lines.push(`  only in actual:   ${k}`)
  for (const [k, ra] of ea) {
    const rb = eb.get(k)
    if (!rb) continue
    for (const f of fields) {
      if (norm(ra[f]) !== norm(rb[f]))
        lines.push(
          `  ${k} ${f}:\n      expected ${norm(ra[f]).slice(0, 300)}\n      actual   ${norm(rb[f]).slice(0, 300)}`,
        )
    }
  }
  say(`## ${title}: ${lines.length ? `${lines.length} difference(s)` : 'same'}`)
  for (const l of lines) say(l)
}

const policies = (audit) => (audit.tables ?? []).flatMap((t) => t.policies.map((p) => ({ ...p, table: t.table })))
const indexKey = (r) => `${r.table}|${r.definition.replace(/INDEX \S+ ON/, 'INDEX ON')}`

say(`Expected: Postgres ${expected.postgres_version}. Actual: Postgres ${actual.postgres_version}.`)
say()
diff('Tables', expected.tables, actual.tables, (r) => r.table, ['owner', 'rls_enabled', 'rls_forced'])
diff('Policies', policies(expected), policies(actual), (r) => `${r.table}|${r.policy}`, [
  'command',
  'permissive',
  'roles',
  'using',
  'with_check',
])
diff('Table privileges', expected.grants, actual.grants, (r) => `${r.table}|${r.grantee}`, ['privileges'])
diff(
  'Column privileges',
  expected.column_grants,
  actual.column_grants,
  (r) => `${r.table}|${r.column}|${r.grantee}|${r.privilege}`,
  [],
)
diff('Columns', expected.columns, actual.columns, (r) => `${r.table}|${r.column}`, [
  'type',
  'nullable',
  'default',
  'identity',
])
diff('Constraints', expected.constraints, actual.constraints, (r) => `${r.table}|${r.definition}`, [])
diff('Indexes', expected.indexes, actual.indexes, indexKey, [])
diff('Views', expected.views, actual.views, (r) => r.view, ['options', 'anon_can_select', 'definition'])
diff('Functions', expected.functions, actual.functions, (r) => r.function, [
  'security_definer',
  'config',
  'acl',
  'anon_can_execute',
  'authenticated_can_execute',
  'definition',
])
diff('Triggers', expected.triggers, actual.triggers, (r) => `${r.table}|${r.trigger}`, ['enabled', 'definition'])
diff('Extensions', expected.extensions, actual.extensions, (r) => `${r.schema}.${r.extension}`, [])
diff('Schemas', expected.schemas, actual.schemas, (r) => r.schema, ['anon_usage', 'authenticated_usage'])

// Security review of the actual database, whatever the expected one says.
const flags = []
for (const t of actual.tables ?? []) {
  if (!inScope(t.table)) continue
  if (!t.rls_enabled) flags.push(`${t.table}: row-level security is OFF`)
  for (const p of t.policies) {
    const always =
      ['true', null].includes(p.using?.trim() ?? null) && ['true', null].includes(p.with_check?.trim() ?? null)
    if (p.roles.includes('public') || p.roles.includes('anon'))
      flags.push(`${t.table}: policy "${p.policy}" applies to ${p.roles.join(', ')} (visitors included)`)
    if (always && p.permissive) flags.push(`${t.table}: policy "${p.policy}" allows every row (${p.command})`)
  }
}
for (const g of actual.grants ?? []) {
  if (inScope(g.table) && g.grantee === 'anon') flags.push(`${g.table}: visitors (anon) have ${g.privileges}`)
}
for (const f of actual.functions ?? []) {
  if (!inScope(f.function)) continue
  const searchPath = (f.config ?? []).some((c) => c.startsWith('search_path='))
  if (f.security_definer && !searchPath) flags.push(`${f.function}: security definer without a fixed search_path`)
  // A trigger function can't be called on its own, so who may execute it doesn't matter.
  const callable = f.returns !== 'trigger'
  if (f.security_definer && callable && f.anon_can_execute)
    flags.push(`${f.function}: security definer, executable by visitors`)
  if (f.security_definer && callable && f.authenticated_can_execute)
    flags.push(`${f.function}: security definer, executable by signed-in users (check it only acts on auth.uid())`)
}
for (const v of actual.views ?? []) {
  const invoker = (v.options ?? []).some((o) => /^security_invoker=(true|on)$/i.test(o))
  if (inScope(v.view) && !invoker && (v.anon_can_select || v.authenticated_can_select))
    flags.push(`${v.view}: view runs with its owner's rights (no security_invoker) and the API roles can read it`)
}
for (const t of actual.triggers ?? []) {
  if (t.table === 'auth.users') flags.push(`${t.trigger} on auth.users: staging needs the same trigger`)
}
for (const s of actual.schemas ?? []) {
  if (s.schema === 'private' && (s.anon_usage || s.authenticated_usage))
    flags.push('schema private is usable by the API roles')
}
say()
say(`## Security review of the actual database: ${flags.length ? `${flags.length} item(s)` : 'nothing flagged'}`)
for (const f of flags) say(`  - ${f}`)

console.log(out.join('\n'))
