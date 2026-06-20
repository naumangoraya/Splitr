-- ============================================================
-- Splitr — audit fixes to apply on TOP of an already-migrated DB.
-- Your columns/tables/RPCs already exist; this updates the POLICY definitions
-- and RPC BODIES to the corrected versions, and clears stale legacy flags.
-- Run the whole block in the Supabase SQL Editor. Idempotent / safe to re-run.
-- ============================================================

-- 1) groups_read: creator can read before the membership row exists
--    (without this, creating a group 403s on the insert-then-select)
drop policy if exists groups_read on groups;
create policy groups_read on groups for select to authenticated
  using (is_group_member(id, auth.uid()) or created_by = auth.uid());

-- 2) gm_delete: you may remove yourself; only the owner may remove others
drop policy if exists gm_delete on group_members;
create policy gm_delete on group_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from groups g where g.id = group_id and g.created_by = auth.uid())
  );

-- 3) remove_friend: net now mirrors the app (active splits, confirmed settlements, multi-payer)
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
grant execute on function remove_friend(uuid) to authenticated;

-- 4) one-time cleanup: drop stale legacy whole-expense settle/dispute flags
--    (we now track settle/dispute per person on expense_splits)
update expenses set settled_at = null, disputed_at = null
where settled_at is not null or disputed_at is not null;

-- 5) activity: members see only what happened AT/AFTER they joined the group
--    (a newly-added member no longer sees the group's older history)
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
