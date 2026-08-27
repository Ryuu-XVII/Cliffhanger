create index if not exists entries_user_status_idx on public.entries (user_id, ((data->>'status')));
create index if not exists notification_receipts_created_idx on public.notification_receipts (created_at);
create index if not exists devices_user_idx on public.devices (user_id);
