-- §12: crash reporting. The spec names Crashlytics, but the backend is Supabase,
-- so reports land here instead. Clients may only ever insert their own rows -
-- reads are for the operator via the service role, never the app.
create table if not exists public.crash_reports (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  stack text,
  severity text not null default 'error',
  source text not null default 'manual',
  context jsonb not null default '{}'::jsonb,
  app_version text,
  platform text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.crash_reports enable row level security;

drop policy if exists "insert own crash reports" on public.crash_reports;
drop policy if exists "no client reads" on public.crash_reports;

-- Insert-only: a client can file a report against itself and nothing else.
create policy "insert own crash reports" on public.crash_reports
  for insert with check (auth.uid() = user_id);

-- Clients never read crash reports back, including their own.
create policy "no client reads" on public.crash_reports
  for select using (false);

create index if not exists crash_reports_occurred_idx on public.crash_reports (occurred_at desc);
create index if not exists crash_reports_user_idx on public.crash_reports (user_id);
