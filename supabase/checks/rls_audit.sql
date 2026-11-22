-- Read-only audit of how the database is set up: tables and owners, row-level security and policies, grants to the
-- API roles, columns, constraints (with what happens on delete), indexes, functions, triggers, default privileges and
-- login roles. It reads only the catalog, never a row of data, so it's safe to run on production.
--
-- Run it in the Supabase SQL editor (production first), then copy the single JSON result and keep it with the
-- migration review. It's one statement because the SQL editor only shows the last result.

select jsonb_pretty(jsonb_build_object(
  'postgres_version', current_setting('server_version'),

  'tables', (
    select coalesce(jsonb_agg(t order by t ->> 'table'), '[]'::jsonb) from (
      select jsonb_build_object(
        'table', c.relname,
        'owner', pg_get_userbyid(c.relowner),
        'rls_enabled', c.relrowsecurity,
        'rls_forced', c.relforcerowsecurity,
        'policies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'policy', p.polname,
            'command', case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
                                     when 'd' then 'delete' else 'all' end,
            'permissive', p.polpermissive,
            'roles', (select coalesce(array_agg(rolname order by rolname), array['public']) from pg_roles where oid = any(p.polroles)),
            'using', pg_get_expr(p.polqual, p.polrelid),
            'with_check', pg_get_expr(p.polwithcheck, p.polrelid)) order by p.polname)
          from pg_policy p where p.polrelid = c.oid), '[]'::jsonb)
      ) as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
    ) x
  ),

  'grants', (
    select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privileges', privileges)
                              order by table_name, grantee), '[]'::jsonb)
    from (
      select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
      group by table_name, grantee
    ) g
  ),

  'column_grants', (
    select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'grantee', grantee,
                                                 'privilege', privilege_type)), '[]'::jsonb)
    from information_schema.column_privileges cp
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and not exists (select 1 from information_schema.role_table_grants tg
                      where tg.table_schema = cp.table_schema and tg.table_name = cp.table_name
                        and tg.grantee = cp.grantee and tg.privilege_type = cp.privilege_type)
  ),

  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'type', data_type,
                                                 'nullable', is_nullable, 'default', column_default,
                                                 'identity', is_identity)
                              order by table_name, ordinal_position), '[]'::jsonb)
    from information_schema.columns where table_schema = 'public'
  ),

  'constraints', (
    select coalesce(jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname,
                                                 'definition', pg_get_constraintdef(oid))
                              order by conrelid::regclass::text, conname), '[]'::jsonb)
    from pg_constraint where connamespace = 'public'::regnamespace
  ),

  'indexes', (
    select coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'definition', indexdef)
                              order by tablename, indexname), '[]'::jsonb)
    from pg_indexes where schemaname = 'public'
  ),

  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      'owner', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'anon_can_execute', has_function_privilege('anon', p.oid, 'execute'),
      'authenticated_can_execute', has_function_privilege('authenticated', p.oid, 'execute'))
      order by n.nspname, p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
  ),

  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object('table', event_object_schema || '.' || event_object_table,
                                                 'trigger', trigger_name, 'timing', action_timing,
                                                 'event', event_manipulation, 'action', action_statement)
                              order by event_object_table, trigger_name), '[]'::jsonb)
    from information_schema.triggers
    where event_object_schema = 'public' or (event_object_schema = 'auth' and event_object_table = 'users')
  ),

  'default_privileges', (
    select coalesce(jsonb_agg(jsonb_build_object('owner', pg_get_userbyid(d.defaclrole),
                                                 'schema', coalesce(n.nspname, 'all schemas'),
                                                 'object_type', d.defaclobjtype, 'acl', d.defaclacl::text[])), '[]'::jsonb)
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname is null or n.nspname in ('public', 'private')
  ),

  'schemas', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', nspname,
      'anon_usage', has_schema_privilege('anon', oid, 'usage'),
      'authenticated_usage', has_schema_privilege('authenticated', oid, 'usage'))
      order by nspname), '[]'::jsonb)
    from pg_namespace where nspname in ('public', 'private', 'auth')
  ),

  'login_roles', (
    select coalesce(jsonb_agg(jsonb_build_object('role', rolname, 'superuser', rolsuper, 'bypass_rls', rolbypassrls,
                                                 'create_role', rolcreaterole, 'valid_until', rolvaliduntil)
                              order by rolname), '[]'::jsonb)
    from pg_roles
    where rolcanlogin and rolname not like 'pg\_%' and rolname not like 'supabase\_%'
  )
)) as audit;
