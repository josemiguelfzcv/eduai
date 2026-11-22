-- Read-only audit of how the database is set up: tables and owners, row-level security and policies, grants to the
-- API roles, columns, constraints (with what happens on delete), indexes, views, functions (with their source and
-- who may run them), triggers, extensions, default privileges and login roles. It reads only the catalog, never a row
-- of data, so it's safe to run on production. Schemas public and private (private exists on staging only).
--
-- Run it in the Supabase SQL editor (production first), then copy the single JSON result and keep it with the
-- migration review. It's one statement because the SQL editor only shows the last result. Objects that belong to an
-- extension are left out. scripts/db/compare-audit.mjs compares two of these results.

select jsonb_pretty(jsonb_build_object(
  'postgres_version', current_setting('server_version'),

  'tables', (
    select coalesce(jsonb_agg(t order by t ->> 'table'), '[]'::jsonb) from (
      select jsonb_build_object(
        'table', n.nspname || '.' || c.relname,
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
      where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
        and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    ) x
  ),

  -- Effective privileges of each API role (and lyceo_server, where it exists), whoever granted them, PUBLIC included.
  'grants', (
    select coalesce(jsonb_agg(jsonb_build_object('table', tbl, 'grantee', rolname, 'privileges', privs)
                              order by tbl, rolname), '[]'::jsonb)
    from (
      select n.nspname || '.' || c.relname as tbl, r.rolname, string_agg(p.priv, ', ' order by p.priv) as privs
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (select oid, rolname from pg_roles
                  where rolname in ('anon', 'authenticated', 'service_role', 'lyceo_server')) r
      cross join (values ('DELETE'), ('INSERT'), ('REFERENCES'), ('SELECT'), ('TRIGGER'), ('TRUNCATE'), ('UPDATE')) p(priv)
      where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm')
        and has_table_privilege(r.oid, c.oid, p.priv)
      group by 1, 2
    ) g
  ),

  -- Column-level privileges a role has without the table-level one (e.g. insert on some columns only).
  'column_grants', (
    select coalesce(jsonb_agg(jsonb_build_object('table', n.nspname || '.' || c.relname, 'column', a.attname,
                                                 'grantee', r.rolname, 'privilege', p.priv)
                              order by n.nspname, c.relname, a.attnum, r.rolname, p.priv), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join (select oid, rolname from pg_roles where rolname in ('anon', 'authenticated', 'lyceo_server')) r
    cross join (values ('INSERT'), ('SELECT'), ('UPDATE')) p(priv)
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
      and has_column_privilege(r.oid, c.oid, a.attnum, p.priv)
      and not has_table_privilege(r.oid, c.oid, p.priv)
  ),

  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object('table', n.nspname || '.' || c.relname, 'column', a.attname,
                                                 'type', format_type(a.atttypid, a.atttypmod),
                                                 'nullable', not a.attnotnull,
                                                 'default', pg_get_expr(ad.adbin, ad.adrelid),
                                                 'identity', nullif(a.attidentity::text, ''))
                              order by n.nspname, c.relname, a.attnum), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
  ),

  'constraints', (
    select coalesce(jsonb_agg(jsonb_build_object('table', n.nspname || '.' || c.relname, 'name', k.conname,
                                                 'definition', pg_get_constraintdef(k.oid))
                              order by n.nspname, c.relname, k.conname), '[]'::jsonb)
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private')
  ),

  'indexes', (
    select coalesce(jsonb_agg(jsonb_build_object('table', schemaname || '.' || tablename, 'definition', indexdef)
                              order by schemaname, tablename, indexname), '[]'::jsonb)
    from pg_indexes where schemaname in ('public', 'private')
  ),

  -- Views run with their owner's rights unless security_invoker is set, so a view can bypass row-level security.
  'views', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'view', n.nspname || '.' || c.relname,
      'kind', case c.relkind when 'm' then 'materialized' else 'view' end,
      'owner', pg_get_userbyid(c.relowner),
      'options', c.reloptions,
      'anon_can_select', has_table_privilege('anon', c.oid, 'select'),
      'authenticated_can_select', has_table_privilege('authenticated', c.oid, 'select'),
      'definition', pg_get_viewdef(c.oid))
      order by n.nspname, c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('v', 'm')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  ),

  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      'returns', pg_get_function_result(p.oid),
      'owner', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'acl', p.proacl::text[],
      'anon_can_execute', has_function_privilege('anon', p.oid, 'execute'),
      'authenticated_can_execute', has_function_privilege('authenticated', p.oid, 'execute'),
      'definition', case when p.prokind in ('f', 'p') then pg_get_functiondef(p.oid) end)
      order by n.nspname, p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  ),

  -- Triggers on Lyceo's tables, and any on auth.users (a common way to create a profile row at sign-up).
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object('table', n.nspname || '.' || c.relname, 'trigger', t.tgname,
                                                 'enabled', t.tgenabled <> 'D', 'definition', pg_get_triggerdef(t.oid))
                              order by n.nspname, c.relname, t.tgname), '[]'::jsonb)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and (n.nspname in ('public', 'private') or (n.nspname = 'auth' and c.relname = 'users'))
  ),

  'extensions', (
    select coalesce(jsonb_agg(jsonb_build_object('extension', e.extname, 'version', e.extversion,
                                                 'schema', n.nspname) order by e.extname), '[]'::jsonb)
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  ),

  'default_privileges', (
    select coalesce(jsonb_agg(jsonb_build_object('owner', pg_get_userbyid(d.defaclrole),
                                                 'schema', coalesce(n.nspname, 'all schemas'),
                                                 'object_type', d.defaclobjtype, 'acl', d.defaclacl::text[])
                              order by pg_get_userbyid(d.defaclrole), n.nspname, d.defaclobjtype), '[]'::jsonb)
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname is null or n.nspname in ('public', 'private')
  ),

  'schemas', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', nspname,
      'owner', pg_get_userbyid(nspowner),
      'acl', nspacl::text[],
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
