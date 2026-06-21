-- ============================================================
-- Splitr migration — FCM background push: device tokens
-- Run in the Supabase SQL Editor. Idempotent / safe to re-run.
-- (The Edge Function reads device_tokens via the service role, bypassing RLS.)
-- ============================================================

create table if not exists device_tokens (
  token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

alter table device_tokens enable row level security;

drop policy if exists device_tokens_rw on device_tokens;
create policy device_tokens_rw on device_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on device_tokens to authenticated;

create index if not exists idx_device_tokens_user on device_tokens(user_id);
