-- Read-only. Run in the Supabase SQL editor and keep the output with the migration review.

-- 1. Every table in public, whether row-level security is on, and its policies.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       coalesce(json_agg(json_build_object(
         'policy', p.polname,
         'command', case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
                                  when 'd' then 'delete' else 'all' end,
         'roles', (select array_agg(rolname) from pg_roles where oid = any(p.polroles)),
         'using', pg_get_expr(p.polqual, p.polrelid),
         'with_check', pg_get_expr(p.polwithcheck, p.polrelid)))
         filter (where p.polname is not null), '[]') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by 1;

-- 2. Tables anyone could read or write through the API: RLS off.
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 3. Columns, to version the real schema before the next migration.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 4. Foreign keys and what happens on delete.
select tc.table_name, kcu.column_name, ccu.table_name as references_table, rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
order by 1, 2;
