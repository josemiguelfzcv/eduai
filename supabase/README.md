# Database

| Folder | What it is | Where it runs |
|---|---|---|
| `migrations/0001_my_academy.sql` | Courses and deadlines (My Academy) | Production when approved; staging via `npm run db:migrate:staging` |
| `migrations/0002`–`0004` | Learning loop, trusted server path, account deletion | **Staging only** until the schema review is approved |
| `staging/0000_baseline.sql` | Production's original tables, reconstructed | Staging and local tests only, never production |
| `checks/rls_audit.sql` | Read-only audit: tables, RLS and policies, effective privileges, columns, constraints, indexes, views, functions (source and grants), triggers, extensions. Compare two results with `node scripts/db/compare-audit.mjs <expected> <actual>` | Safe anywhere, including production |
| `tests/supabase_shim.sql` | Roles and `auth` functions of a Supabase project | Local Postgres and CI only |

## Who can do what

- **Students** reach `public` through the Data API as `authenticated`, limited by row-level security. They organize their
  own materials, courses, deadlines and skill map (a skill with recorded answers can be hidden, not deleted). They can
  read, but never write, study sessions and the evidence those sessions produce, and never see answer keys before
  they answer: keys live in `private.item_keys`, and the server copies a solution into the evidence only once the
  student has answered.
- **Visitors** (`anon`) have no privileges on any table.
- **Lyceo's server** also connects as `lyceo_server` (pooled Postgres, `LYCEO_SERVER_DATABASE_URL`). That role can
  only execute the functions in schema `private`: usage reservations and costs, answer keys, study-session evidence,
  a material's accepted file, account cleanup. It has no table privileges and can't bypass row-level security.
- **Nobody uses a Supabase secret (service-role) key.** Account deletion runs as the student
  (`public.delete_my_account()`, which can only delete `auth.uid()` and requires a sign-in within 15 minutes).
- Schema `private` is not exposed through the Data API, and `anon`/`authenticated` have no privileges on it.

## Testing

```sh
# Local Postgres (superuser). Builds a throwaway database shaped like Supabase, applies everything, runs 35 checks.
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```

CI runs the same tests on Postgres 17. On the real staging project, `npm run check:staging -- --i-am-on-staging`
(or the "Staging database" workflow) verifies the same properties through Supabase's own API and pooler.
