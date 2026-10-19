-- CIVSAR TTX — Supabase schema. Run in Supabase SQL editor. Then enable Realtime for the three tables
-- (Database → Replication, or the ALTER PUBLICATION lines below).

create table if not exists exercises (
  id text primary key,
  title text not null,
  data jsonb not null,               -- full scenario JSON (meta, roles, injects)
  updated_at timestamptz default now()
);

create table if not exists sessions (
  code text primary key,             -- 6-char join code
  exercise_id text references exercises(id) on delete cascade,
  scenario jsonb not null,           -- frozen copy of the scenario for this run
  state jsonb not null default '{}', -- {status, startedAt, pausedAt, offsetMs, released:{injectId:ts}, speed}
  created_at timestamptz default now()
);

create table if not exists session_events (
  id bigint generated always as identity primary key,
  code text references sessions(code) on delete cascade,
  kind text not null,                -- release | response | log | eval | join | sitrep | resource | marker | hotwash | file
  role text,
  author text,
  inject_id text,
  payload jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists session_events_code on session_events(code, created_at);
-- Shared files ride in payload as a data URL (the app caps them at 1 MB and resizes photos), so no
-- extra table or bucket is needed. If you expect many large files, move them to Supabase Storage
-- and share the object URL instead — the app treats any payload.url as a link.

alter table exercises enable row level security;
alter table sessions enable row level security;
alter table session_events enable row level security;

-- Join-code model: anyone holding the anon key + a session code can read/write that session.
-- Tighten for production (e.g. Supabase Auth + org membership) — see README "Security".
create policy "anon all exercises" on exercises for all using (true) with check (true);
create policy "anon all sessions" on sessions for all using (true) with check (true);
create policy "anon all events" on session_events for all using (true) with check (true);

alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table session_events;
