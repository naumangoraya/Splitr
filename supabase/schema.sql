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
  settled_at timestamptz,
  disputed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists expense_splits (
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  amount_owed_cents bigint not null check (amount_owed_cents >= 0),
  shares numeric,
  percentage numeric,
  settled_at timestamptz,
  disputed_at timestamptz,
  primary key (expense_id, user_id)
);

create table if not exists expense_payments (
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents >= 0),
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
  status text not null default 'confirmed' check (status in ('pending','confirmed','disputed')),
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
-- INVITE / ADD-FRIEND RPCs (SECURITY DEFINER)
-- These let a member add another person by EMAIL. If that email already
-- belongs to a Splitr account, the person is added to the group right away;
-- otherwise an invitation is recorded for the new-user trigger to claim.
-- SECURITY DEFINER lets us look up the email + insert membership without
-- exposing the profiles table to email enumeration via the client.
-- ============================================================

-- Add an existing-or-future user to a group the caller belongs to.
-- Returns 'added' (account existed) or 'invited' (recorded for sign-up).
-- Inviter is always the authenticated caller (never trust a client-passed id).
create or replace function invite_to_group(p_group_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  target_id uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  -- only members of the group may invite
  if not is_group_member(p_group_id, me) then
    raise exception 'Not a member of this group';
  end if;

  select id into target_id from profiles where lower(email) = lower(p_email) limit 1;

  if target_id is not null then
    insert into group_members (group_id, user_id, role)
    values (p_group_id, target_id, 'member')
    on conflict do nothing;
    return 'added';
  end if;

  insert into invitations (group_id, email, invited_by)
  values (p_group_id, lower(p_email), me)
  on conflict (group_id, email) do nothing;
  return 'invited';
end;
$$;

-- Create (or reuse) a 2-person direct group between the caller and an
-- existing user identified by email. Returns the direct group's id.
create or replace function add_friend_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  friend_id uuid;
  existing_id uuid;
  new_id uuid;
  friend_name text;
  my_currency char(3);
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select id, coalesce(nullif(full_name, ''), email)
    into friend_id, friend_name
    from profiles where lower(email) = lower(p_email) limit 1;

  if friend_id is null then
    raise exception 'No Splitr user found with that email. Ask them to sign up first.';
  end if;
  if friend_id = me then
    raise exception 'That is your own email.';
  end if;

  -- reuse an existing direct group shared by exactly these two people
  select g.id into existing_id
  from groups g
  where g.is_direct
    and exists (select 1 from group_members where group_id = g.id and user_id = me)
    and exists (select 1 from group_members where group_id = g.id and user_id = friend_id)
  limit 1;
  if existing_id is not null then
    return existing_id;
  end if;

  select preferred_currency into my_currency from profiles where id = me;

  insert into groups (name, default_currency, is_direct, created_by)
  values (friend_name, coalesce(my_currency, 'PKR'), true, me)
  returning id into new_id;

  insert into group_members (group_id, user_id, role) values
    (new_id, me, 'owner'),
    (new_id, friend_id, 'member');

  return new_id;
end;
$$;

-- Remove a friend = delete the 2-person direct group, but only when the
-- balance between the two is fully settled (net = 0). Refuses otherwise so
-- an outstanding debt can never be silently erased.
create or replace function remove_friend(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  is_direct_grp boolean;
  net bigint := 0;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if not is_group_member(p_group_id, me) then
    raise exception 'Not your friend';
  end if;
  select is_direct into is_direct_grp from groups where id = p_group_id;
  if is_direct_grp is not true then
    raise exception 'Not a direct (friend) group';
  end if;

  -- My net, mirroring the app's expenseNet():
  --   per active expense (not whole-settled/disputed):
  --     activeOwed = sum of splits that are NOT settled/disputed
  --     my credit  = (what I paid / total paid) * activeOwed   [payers credited only up to still-owed]
  --     my owed    = my split amount IF my split is active, else 0
  --   net += my credit - my owed
  -- plus confirmed settlements only.
  select coalesce(sum(
    -- my proportional credit of the still-owed amount
    ( case when ep_total.total > 0 then (ep_me.paid::numeric / ep_total.total) else 0 end
      * active.owed )
    -- minus what I still owe (my split, if active)
    - coalesce(my_split.owed, 0)
  ), 0)::bigint
  into net
  from expenses e
  -- total still-owed (active splits only)
  cross join lateral (
    select coalesce(sum(s.amount_owed_cents), 0) as owed
    from expense_splits s
    where s.expense_id = e.id and s.settled_at is null and s.disputed_at is null
  ) active
  -- total paid on this expense (payments table, else fall back to paid_by/amount)
  cross join lateral (
    select coalesce(nullif(sum(p.amount_cents), 0), e.amount_cents) as total
    from expense_payments p where p.expense_id = e.id
  ) ep_total
  -- what I paid
  cross join lateral (
    select coalesce(
      (select sum(p.amount_cents) from expense_payments p where p.expense_id = e.id and p.user_id = me),
      case when e.paid_by = me then e.amount_cents else 0 end
    ) as paid
  ) ep_me
  -- my active owed
  left join lateral (
    select s.amount_owed_cents as owed
    from expense_splits s
    where s.expense_id = e.id and s.user_id = me
      and s.settled_at is null and s.disputed_at is null
  ) my_split on true
  where e.group_id = p_group_id and e.deleted_at is null
    and e.settled_at is null and e.disputed_at is null;

  net := net + coalesce((select sum(
    case when st.from_user = me then st.amount_cents
         when st.to_user = me then -st.amount_cents else 0 end)
    from settlements st where st.group_id = p_group_id and st.status = 'confirmed'), 0);

  if net <> 0 then
    raise exception 'Settle up before removing this friend.';
  end if;

  delete from groups where id = p_group_id;  -- cascades to members/expenses/splits/settlements
end;
$$;

grant execute on function invite_to_group(uuid, text) to authenticated;
grant execute on function add_friend_by_email(text) to authenticated;
grant execute on function remove_friend(uuid) to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles        enable row level security;
alter table groups          enable row level security;
alter table group_members   enable row level security;
alter table expenses        enable row level security;
alter table expense_splits  enable row level security;
alter table expense_payments enable row level security;
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
-- creator can read even before the membership row exists (insert-then-select gotcha)
drop policy if exists groups_read on groups;
create policy groups_read on groups for select to authenticated
  using (is_group_member(id, auth.uid()) or created_by = auth.uid());
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
-- you may remove yourself; only the group owner may remove someone else
drop policy if exists gm_delete on group_members;
create policy gm_delete on group_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from groups g where g.id = group_id and g.created_by = auth.uid())
  );

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

-- expense_payments: gated through the parent expense's group (same as splits)
drop policy if exists payments_rw on expense_payments;
create policy payments_rw on expense_payments for all to authenticated
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

-- activity: members read only what happened AT/AFTER they joined the group; insert by members
drop policy if exists activity_read on activity;
create policy activity_read on activity for select to authenticated using (
  group_id is null
  or exists (
    select 1 from group_members gm
    where gm.group_id = activity.group_id
      and gm.user_id = auth.uid()
      and activity.created_at >= gm.joined_at
  )
);
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
create index if not exists idx_payments_expense on expense_payments(expense_id);
create index if not exists idx_settlements_group on settlements(group_id);
create index if not exists idx_activity_group on activity(group_id, created_at desc);
create index if not exists idx_invitations_email on invitations(lower(email));
