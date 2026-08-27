-- Run this in Supabase SQL Editor before enabling account sync.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  anilist_id integer not null,
  data jsonb not null,
  updated_at bigint not null,
  primary key (user_id, anilist_id)
);
create table if not exists public.custom_lists (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  primary key (user_id, id)
);
create table if not exists public.devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null,
  timezone_offset_minutes integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.custom_lists enable row level security;
alter table public.devices enable row level security;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own entries" on public.entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own lists" on public.custom_lists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own devices" on public.devices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create or replace function public.delete_my_account(target_user_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is distinct from target_user_id then raise exception 'not allowed'; end if;
  delete from auth.users where id = target_user_id;
end;
$$;
