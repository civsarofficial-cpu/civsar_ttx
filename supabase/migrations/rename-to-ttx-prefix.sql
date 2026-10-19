-- CIVSAR TTX — rename the app's tables to the ttx_ prefix.
--
-- WHO THIS IS FOR
-- Only projects that already ran the earlier schema.sql, which created `exercises`, `sessions`
-- and `session_events` without a prefix. A new project should just run supabase/schema.sql,
-- which already creates the prefixed names.
--
-- ⚠ CHECK BEFORE RUNNING
-- Run this ONLY where those three tables belong to CIVSAR TTX. The whole point of the prefix is
-- that this app may share a Supabase project with other applications — and in exactly that kind
-- of project, a table called `sessions` or `exercises` may well belong to something else.
-- Renaming another application's table will break it. If you are not certain, inspect them first:
--
--   select table_name from information_schema.tables where table_schema = 'public';
--   select * from public.sessions limit 1;   -- CIVSAR TTX sessions have: code, scenario, state
--
-- WHAT FOLLOWS THE RENAME AUTOMATICALLY
-- Postgres tracks these by object ID rather than by name, so renaming the table carries them:
--   - foreign keys (ttx_sessions.exercise_id → ttx_exercises.id, ttx_session_events.code → ttx_sessions.code)
--   - row-level security policies, including their existing names
--   - membership of the supabase_realtime publication
--   - the primary key and identity sequence
-- Nothing else needs re-running. The policy names stay as they were ("anon all exercises" and so
-- on); rename them too with the optional block at the end if you want them to match schema.sql.
--
-- Run it in the Supabase SQL editor. It is wrapped in a transaction: if any statement fails,
-- nothing changes.

begin;

alter table public.exercises      rename to ttx_exercises;
alter table public.sessions       rename to ttx_sessions;
alter table public.session_events rename to ttx_session_events;

alter index public.session_events_code rename to ttx_session_events_code;

commit;

-- Optional: bring the policy names in line with schema.sql. Renaming a policy changes nothing
-- about who can read or write — only the label shown in the Supabase dashboard.
--
-- begin;
-- alter policy "anon all exercises" on public.ttx_exercises      rename to "anon all ttx_exercises";
-- alter policy "anon all sessions"  on public.ttx_sessions       rename to "anon all ttx_sessions";
-- alter policy "anon all events"    on public.ttx_session_events rename to "anon all ttx_session_events";
-- commit;

-- Verify afterwards:
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_name like 'ttx_%';
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
--
-- Then redeploy the app, or reload it, so the client uses the new names.
