-- ============================================================
-- Splitr — ALL pending migrations in one block (corrected).
-- Run this whole thing in the Supabase SQL Editor. Idempotent / safe to re-run.
-- ============================================================

-- 0) FIX: creator can read a group before the membership row exists
--    (insert-then-select gotcha — without this, creating a group 403s)
drop policy if exists groups_read on groups;
create policy groups_read on groups for select to authenticated
  using (is_group_member(id, auth.uid()) or created_by = auth.uid());

-- 1) settle / dispute individual expenses (legacy whole-expense flags)
alter table expenses add column if not exists settled_at  timestamptz;
alter table expenses add column if not exists disputed_at timestamptz;

-- 2) settlement request / confirm / dispute states
alter table settlements add column if not exists status text not null default 'confirmed';
alter table settlements drop constraint if exists settlements_status_check;
alter table settlements add constraint settlements_status_check
  check (status in ('pending','confirmed','disputed'));

-- 3) multiple payers per expense
create table if not exists expense_payments (
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id    uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (expense_id, user_id)
);
alter table expense_payments enable row level security;
drop policy if exists payments_rw on expense_payments;
create policy payments_rw on expense_payments for all to authenticated
  using (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id, auth.uid())))
  with check (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id, auth.uid())));
create index if not exists idx_payments_expense on expense_payments(expense_id);
grant select, insert, update, delete on expense_payments to authenticated;

-- 4) per-person (per-split) settle / dispute
alter table expense_splits add column if not exists settled_at  timestamptz;
alter table expense_splits add column if not exists disputed_at timestamptz;

-- 5) friend / invite RPCs
create or replace function invite_to_group(p_group_id uuid, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not is_group_member(p_group_id, me) then raise exception 'Not a member of this group'; end if;
  select id into target_id from profiles where lower(email)=lower(p_email) limit 1;
  if target_id is not null then
    insert into group_members (group_id,user_id,role) values (p_group_id,target_id,'member') on conflict do nothing;
    return 'added';
  end if;
  insert into invitations (group_id,email,invited_by) values (p_group_id,lower(p_email),me) on conflict (group_id,email) do nothing;
  return 'invited';
end; $$;

create or replace function add_friend_by_email(p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); friend_id uuid; existing_id uuid; new_id uuid; friend_name text; my_currency char(3);
begin
  if me is null then raise exception 'Not signed in'; end if;
  select id, coalesce(nullif(full_name,''),email) into friend_id,friend_name from profiles where lower(email)=lower(p_email) limit 1;
  if friend_id is null then raise exception 'No Splitr user found with that email. Ask them to sign up first.'; end if;
  if friend_id = me then raise exception 'That is your own email.'; end if;
  select g.id into existing_id from groups g
   where g.is_direct
     and exists (select 1 from group_members where group_id=g.id and user_id=me)
     and exists (select 1 from group_members where group_id=g.id and user_id=friend_id) limit 1;
  if existing_id is not null then return existing_id; end if;
  select preferred_currency into my_currency from profiles where id=me;
  insert into groups (name,default_currency,is_direct,created_by) values (friend_name,coalesce(my_currency,'PKR'),true,me) returning id into new_id;
  insert into group_members (group_id,user_id,role) values (new_id,me,'owner'),(new_id,friend_id,'member');
  return new_id;
end; $$;

-- remove_friend: only deletes a direct group when MY net is zero. Net mirrors the
-- app's expenseNet(): active splits only, payers credited up to still-owed, confirmed settlements only.
create or replace function remove_friend(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); is_direct_grp boolean; net bigint := 0;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not is_group_member(p_group_id, me) then raise exception 'Not your friend'; end if;
  select is_direct into is_direct_grp from groups where id = p_group_id;
  if is_direct_grp is not true then raise exception 'Not a direct (friend) group'; end if;

  select coalesce(sum(
    ( case when ep_total.total > 0 then (ep_me.paid::numeric / ep_total.total) else 0 end * active.owed )
    - coalesce(my_split.owed, 0)
  ), 0)::bigint
  into net
  from expenses e
  cross join lateral (
    select coalesce(sum(s.amount_owed_cents),0) as owed from expense_splits s
    where s.expense_id = e.id and s.settled_at is null and s.disputed_at is null
  ) active
  cross join lateral (
    select coalesce(nullif(sum(p.amount_cents),0), e.amount_cents) as total
    from expense_payments p where p.expense_id = e.id
  ) ep_total
  cross join lateral (
    select coalesce(
      (select sum(p.amount_cents) from expense_payments p where p.expense_id = e.id and p.user_id = me),
      case when e.paid_by = me then e.amount_cents else 0 end) as paid
  ) ep_me
  left join lateral (
    select s.amount_owed_cents as owed from expense_splits s
    where s.expense_id = e.id and s.user_id = me and s.settled_at is null and s.disputed_at is null
  ) my_split on true
  where e.group_id = p_group_id and e.deleted_at is null
    and e.settled_at is null and e.disputed_at is null;

  net := net + coalesce((select sum(
    case when st.from_user = me then st.amount_cents when st.to_user = me then -st.amount_cents else 0 end)
    from settlements st where st.group_id = p_group_id and st.status = 'confirmed'), 0);

  if net <> 0 then raise exception 'Settle up before removing this friend.'; end if;
  delete from groups where id = p_group_id;
end; $$;

grant execute on function invite_to_group(uuid, text) to authenticated;
grant execute on function add_friend_by_email(text) to authenticated;
grant execute on function remove_friend(uuid) to authenticated;

-- 6) one-time cleanup: drop stale legacy whole-expense settle/dispute flags
--    (we now track settle/dispute per person on expense_splits)
update expenses set settled_at = null, disputed_at = null
where settled_at is not null or disputed_at is not null;

-- 7) harden group_members delete: self-removal, or owner removes others
drop policy if exists gm_delete on group_members;
create policy gm_delete on group_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from groups g where g.id = group_id and g.created_by = auth.uid())
  );

-- 8) activity visibility: only from when each member joined
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
