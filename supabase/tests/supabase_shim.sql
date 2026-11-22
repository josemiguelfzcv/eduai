-- A stand-in for the parts of a hosted Supabase project that Lyceo's migrations rely on, so they can be tested on a
-- plain Postgres. Local tests and CI only; never run it against a Supabase project.
--
-- It mirrors what a project created after 30 May 2026 looks like (and every project since 30 October 2026):
--   * API roles anon, authenticated and service_role; PostgREST switches to one of them per request.
--   * auth.uid() and auth.jwt() read the request's JWT claims, exactly as on Supabase.
--   * New tables in public are NOT granted to the API roles automatically. Migrations must grant what they need.
--   * Functions are executable by PUBLIC unless a migration revokes it (Postgres' own default, unchanged by Supabase).
--   * Migrations run as `migrator`, a non-superuser shaped like Supabase's postgres role (CREATEROLE, BYPASSRLS, full
--     privileges on auth.users), so security definer functions get the privileges they would get there.
--
-- Run as a superuser inside a fresh database. Roles are cluster-wide, so they're created only if missing.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'migrator') then create role migrator login createrole bypassrls; end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role, migrator;
grant all on auth.users to migrator;
grant references on auth.users to migrator;

-- Supabase's public schema: owned by the migration role, usable by the API roles, no automatic table grants.
alter schema public owner to migrator;
revoke create on schema public from public;
grant usage on schema public to anon, authenticated, service_role;
