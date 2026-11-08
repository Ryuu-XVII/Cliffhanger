-- Apply before releasing the new client. Tombstones preserve delete versions.
alter table public.entries add column if not exists deleted boolean not null default false;
alter table public.custom_lists add column if not exists deleted boolean not null default false;
alter table public.custom_lists add column if not exists updated_at bigint not null default 0;
update public.custom_lists set updated_at = coalesce((data->>'updatedAt')::bigint, (data->>'createdAt')::bigint, 0) where updated_at = 0;
alter table public.devices add column if not exists delivery_mode text not null default 'local'
  check (delivery_mode in ('local', 'push'));

-- All writes use this authenticated RPC. The comparison is inside ON CONFLICT,
-- under the row lock, so concurrent stale writes cannot overwrite newer data.
create or replace function public.apply_library_change(
  expected_uid uuid, kind text, target_id text, payload jsonb, changed_at bigint, is_deleted boolean
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  affected integer;
begin
  if caller is null or caller is distinct from expected_uid then raise exception 'account session changed'; end if;
  if changed_at is null or changed_at < 0 or payload is null or is_deleted is null then
    raise exception 'invalid change';
  end if;
  if kind = 'entry' then
    if target_id::integer <= 0 then raise exception 'invalid entry id'; end if;
    if not is_deleted and (
      (payload->>'anilistId')::integer is distinct from target_id::integer or
      (payload->>'updatedAt')::bigint is distinct from changed_at or
      coalesce(payload->>'status', '') not in ('WATCHING','PLANNING','COMPLETED','ON_HOLD','DROPPED','REWATCHING') or
      coalesce((payload->>'progress')::numeric, -1) < 0 or
      (payload->>'score')::numeric < 0 or (payload->>'score')::numeric > 100
    ) then raise exception 'invalid entry'; end if;
    insert into public.entries as existing (user_id, anilist_id, data, updated_at, deleted)
      values (caller, target_id::integer, payload, changed_at, is_deleted)
      on conflict (user_id, anilist_id) do update
        set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
        where excluded.updated_at > existing.updated_at;
  elsif kind = 'list' then
    if target_id = '' or (not is_deleted and payload->>'id' is distinct from target_id) then
      raise exception 'invalid list';
    end if;
    insert into public.custom_lists as existing (user_id, id, data, updated_at, deleted)
      values (caller, target_id, payload, changed_at, is_deleted)
      on conflict (user_id, id) do update
        set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
        where excluded.updated_at > existing.updated_at;
  else
    raise exception 'unknown change kind';
  end if;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function public.apply_library_change(uuid,text,text,jsonb,bigint,boolean) from public, anon;
grant execute on function public.apply_library_change(uuid,text,text,jsonb,bigint,boolean) to authenticated;
-- Prevent older clients from bypassing version checks. Reads remain scoped.
drop policy if exists "own entries" on public.entries;
drop policy if exists "own lists" on public.custom_lists;
drop policy if exists "read own entries" on public.entries;
drop policy if exists "read own lists" on public.custom_lists;
create policy "read own entries" on public.entries for select to authenticated using (auth.uid() = user_id);
create policy "read own lists" on public.custom_lists for select to authenticated using (auth.uid() = user_id);

-- An aggregate is one JSON response row, avoiding the API's row cap and
-- offset-pagination races while another device edits/deletes records.
create or replace function public.read_library_snapshot(expected_uid uuid, kind text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from expected_uid then
    raise exception 'account session changed';
  end if;
  if kind = 'entry' then
    select coalesce(jsonb_agg(data order by anilist_id), '[]'::jsonb) into result
      from public.entries where user_id = auth.uid() and not deleted;
  elsif kind = 'list' then
    select coalesce(jsonb_agg(data order by id), '[]'::jsonb) into result
      from public.custom_lists where user_id = auth.uid() and not deleted;
  else raise exception 'unknown snapshot kind';
  end if;
  return result;
end;
$$;
revoke all on function public.read_library_snapshot(uuid,text) from public, anon;
grant execute on function public.read_library_snapshot(uuid,text) to authenticated;
