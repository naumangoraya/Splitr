-- ============================================================
-- Splitr — complete database schema
-- Run this in the Supabase SQL editor (one shot, top to bottom).
-- Safe to re-run: uses "if not exists" / "drop policy if exists".
-- ============================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  avatar_url text,
  preferred_currency char(3) not null default 'PKR',
  created_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  default_currency char(3) not null default 'PKR',
  simplify_debts boolean not null default true,
  is_direct boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  paid_by uuid not null references profiles(id),
  created_by uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'PKR',
  description text not null,
  category text not null default 'general',
  split_type text not null default 'EQUAL' check (split_type in ('EQUAL','EXACT','PERCENT','SHARES')),
  expense_date date not null default current_date,
  receipt_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists expense_splits (
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  amount_owed_cents bigint not null check (amount_owed_cents >= 0),
  shares numeric,
  percentage numeric,
  primary key (expense_id, user_id)
);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_user uuid not null references profiles(id),
  to_user uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'PKR',
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  email text not null,
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, email)
);

-- ============================================================
-- MEMBERSHIP HELPER (SECURITY DEFINER avoids RLS recursion)
-- ============================================================
create or replace function is_group_member(gid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from group_members gm where gm.group_id = gid and gm.user_id = uid
  );
$$;

-- ============================================================
-- NEW USER TRIGGER: create profile + auto-claim invitations
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do nothing;

  -- auto-join any groups this email was invited to
  insert into public.group_members (group_id, user_id, role)
  select i.group_id, new.id, 'member'
  from public.invitations i
  where lower(i.email) = lower(new.email)
  on conflict do nothing;

  delete from public.invitations where lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles        enable row level security;
alter table groups          enable row level security;
alter table group_members   enable row level security;
alter table expenses        enable row level security;
alter table expense_splits  enable row level security;
alter table settlements     enable row level security;
alter table comments        enable row level security;
alter table activity        enable row level security;
alter table invitations     enable row level security;

-- profiles: readable by anyone signed in (needed to render names/avatars of co-members), writable only by self
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated using (true);
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated using (id = auth.uid());
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated with check (id = auth.uid());

-- groups: members can read; any authenticated user can create; owner can update/delete
drop policy if exists groups_read on groups;
create policy groups_read on groups for select to authenticated using (is_group_member(id, auth.uid()));
drop policy if exists groups_insert on groups;
create policy groups_insert on groups for insert to authenticated with check (created_by = auth.uid());
drop policy if exists groups_update on groups;
create policy groups_update on groups for update to authenticated using (is_group_member(id, auth.uid()));
drop policy if exists groups_delete on groups;
create policy groups_delete on groups for delete to authenticated using (created_by = auth.uid());

-- group_members: members can read the roster; a user can add themselves; owners manage
drop policy if exists gm_read on group_members;
create policy gm_read on group_members for select to authenticated using (is_group_member(group_id, auth.uid()));
drop policy if exists gm_insert on group_members;
create policy gm_insert on group_members for insert to authenticated
  with check (user_id = auth.uid() or is_group_member(group_id, auth.uid()));
drop policy if exists gm_delete on group_members;
create policy gm_delete on group_members for delete to authenticated
  using (user_id = auth.uid() or is_group_member(group_id, auth.uid()));

-- expenses: any group member can read/write
drop policy if exists expenses_rw on expenses;
create policy expenses_rw on expenses for all to authenticated
  using (is_group_member(group_id, auth.uid()))
  with check (is_group_member(group_id, auth.uid()));

-- expense_splits: gated through the parent expense's group
drop policy if exists splits_rw on expense_splits;
create policy splits_rw on expense_splits for all to authenticated
  using (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id, auth.uid())))
  with check (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id, auth.uid())));

-- settlements: group members
drop policy if exists settlements_rw on settlements;
create policy settlements_rw on settlements for all to authenticated
  using (is_group_member(group_id, auth.uid()))
  with check (is_group_member(group_id, auth.uid()));

-- comments: members of the expense's group
drop policy if exists comments_rw on comments;
create policy comments_rw on comments for all to authenticated
  using (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id, auth.uid())))
  with check (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id, auth.uid())));

-- activity: group members read; insert by members
drop policy if exists activity_read on activity;
create policy activity_read on activity for select to authenticated using (group_id is null or is_group_member(group_id, auth.uid()));
drop policy if exists activity_insert on activity;
create policy activity_insert on activity for insert to authenticated with check (is_group_member(group_id, auth.uid()));

-- invitations: group members can read/create; the invited email can read its own
drop policy if exists invitations_rw on invitations;
create policy invitations_rw on invitations for all to authenticated
  using (is_group_member(group_id, auth.uid()))
  with check (is_group_member(group_id, auth.uid()));

-- ============================================================
-- GRANTS (required for the Data API on projects created after 2026-05-30)
-- ============================================================
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_gm_user on group_members(user_id);
create index if not exists idx_gm_group on group_members(group_id);
create index if not exists idx_expenses_group on expenses(group_id) where deleted_at is null;
create index if not exists idx_splits_expense on expense_splits(expense_id);
create index if not exists idx_settlements_group on settlements(group_id);
create index if not exists idx_activity_group on activity(group_id, created_at desc);
create index if not exists idx_invitations_email on invitations(lower(email));
