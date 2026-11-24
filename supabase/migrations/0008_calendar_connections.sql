-- 0008 · Google Calendar: a student connects their calendar to Lyceo.
--
-- STAGING ONLY until the schema review is approved. scripts/db/migrate.mjs refuses to run it against production.
--
-- What Lyceo may do once a student connects (the scopes it asks Google for, nothing more):
--   calendar.freebusy     see when the student is busy, never what the events are; read when the Study Plan opens,
--                         never stored
--   calendar.app.created  create one calendar of its own ("Lyceo") and manage the events in it: deadlines and the
--                         study sessions the student chooses to add. It can't see or change any other calendar.
--
-- What's kept, one row per student, in schema private (not reachable from a browser): Google's refresh token,
-- encrypted by Lyceo's server before it gets here (AES-256-GCM; the key is in the server's environment, never in the
-- database), the scopes the student granted, the Google account's email (it may differ from the Lyceo sign-in) and
-- the id of the Lyceo calendar. Disconnecting revokes the token at Google and deletes the row; deleting the account
-- deletes it too (on delete cascade).

create table if not exists private.calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null check (char_length(refresh_token) between 20 and 2000),
  scopes text[] not null default '{}' check (cardinality(scopes) <= 10),
  google_email text check (google_email is null or char_length(google_email) <= 320),
  calendar_id text check (calendar_id is null or char_length(calendar_id) <= 300),
  connected_at timestamptz not null default now(),
  -- When Google refused the token (it expired or the student revoked it); the student connects again.
  expired_at timestamptz,
  last_synced_at timestamptz
);

alter table private.calendar_connections enable row level security;
-- No policies and no grants: only the functions below (running as the schema owner) touch this table.

-- Saves a new connection, or replaces the token of an existing one. A different Google account gets a new calendar.
create or replace function private.calendar_save(p_user uuid, p_token text, p_scopes text[], p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.calendar_connections (user_id, refresh_token, scopes, google_email)
  values (p_user, p_token, coalesce(p_scopes, '{}'), p_email)
  on conflict (user_id) do update
     set refresh_token = excluded.refresh_token,
         scopes = excluded.scopes,
         calendar_id = case
           when private.calendar_connections.google_email is not distinct from excluded.google_email
             then private.calendar_connections.calendar_id
         end,
         google_email = excluded.google_email,
         connected_at = now(),
         expired_at = null;
end
$$;

create or replace function private.calendar_get(p_user uuid)
returns table (
  refresh_token text,
  scopes text[],
  google_email text,
  calendar_id text,
  connected_at timestamptz,
  expired_at timestamptz,
  last_synced_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.refresh_token, c.scopes, c.google_email, c.calendar_id, c.connected_at, c.expired_at, c.last_synced_at
    from private.calendar_connections c
   where c.user_id = p_user
$$;

-- Records the Lyceo calendar's id ('calendar'), that Google refused the token ('expired') or a finished sync
-- ('synced'). Returns false when the student has no connection.
create or replace function private.calendar_note(p_user uuid, p_what text, p_calendar text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_what = 'calendar' then
    update private.calendar_connections set calendar_id = p_calendar where user_id = p_user;
  elsif p_what = 'expired' then
    update private.calendar_connections set expired_at = coalesce(expired_at, now()) where user_id = p_user;
  elsif p_what = 'synced' then
    update private.calendar_connections set last_synced_at = now() where user_id = p_user;
  else
    raise exception 'unknown calendar note %', p_what using errcode = '22023';
  end if;
  return found;
end
$$;

-- Deletes the connection and returns its (encrypted) token, so the server can revoke it at Google.
create or replace function private.calendar_forget(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  delete from private.calendar_connections where user_id = p_user returning refresh_token into v_token;
  return v_token;
end
$$;

revoke all on function private.calendar_save(uuid, text, text[], text) from public;
revoke all on function private.calendar_get(uuid) from public;
revoke all on function private.calendar_note(uuid, text, text) from public;
revoke all on function private.calendar_forget(uuid) from public;
grant execute on function private.calendar_save(uuid, text, text[], text) to lyceo_server;
grant execute on function private.calendar_get(uuid) to lyceo_server;
grant execute on function private.calendar_note(uuid, text, text) to lyceo_server;
grant execute on function private.calendar_forget(uuid) to lyceo_server;
