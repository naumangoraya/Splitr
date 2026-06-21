-- ============================================================
-- Splitr migration — chat + in-app notifications + member management
-- Run the whole block in the Supabase SQL Editor. Idempotent / safe to re-run.
-- (Member leave/delete/remove use the EXISTING gm_delete / groups_delete
--  policies — no schema change needed for those.)
-- ============================================================

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  expense_id uuid references expenses(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  type text not null,
  group_id uuid references groups(id) on delete cascade,
  expense_id uuid references expenses(id) on delete set null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table messages      enable row level security;
alter table notifications enable row level security;

-- messages: any group member can read + post; delete only your own
drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated
  using (is_group_member(group_id, auth.uid()));
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert to authenticated
  with check (is_group_member(group_id, auth.uid()) and user_id = auth.uid());
drop policy if exists messages_delete on messages;
create policy messages_delete on messages for delete to authenticated
  using (user_id = auth.uid());

-- notifications: recipients read/update/delete their own
drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications for delete to authenticated using (user_id = auth.uid());
-- insert: actor must be the caller, recipient must be a co-member of a real group
-- (prevents forged actor_id, arbitrary recipients, and group_id=null spam).
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert to authenticated
  with check (
    actor_id = auth.uid()
    and group_id is not null
    and is_group_member(group_id, auth.uid())
    and is_group_member(group_id, user_id)
  );

grant select, insert, update, delete on messages to authenticated;
grant select, insert, update, delete on notifications to authenticated;

-- realtime: REPLICA IDENTITY FULL so RLS is enforced per-row on the stream
alter table messages replica identity full;
alter table notifications replica identity full;
do $$ begin alter publication supabase_realtime add table messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table notifications; exception when duplicate_object then null; end $$;

create index if not exists idx_messages_group on messages(group_id, created_at);
create index if not exists idx_notifications_user on notifications(user_id, created_at desc);
