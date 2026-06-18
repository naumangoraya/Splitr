import { supabase, isConfigured } from '@/lib/supabase';
import type { Profile, Group, Member, Expense, Settlement, Comment, Activity, SplitType } from '@/types';
import * as seed from './demoData';

export interface NewExpense {
  group_id: string;
  paid_by: string;
  amount_cents: number;
  currency: string;
  description: string;
  category: string;
  split_type: SplitType;
  expense_date: string;
  receipt_url?: string | null;
  splits: { user_id: string; amount_owed_cents: number; shares?: number | null; percentage?: number | null }[];
}

export interface GroupBundle {
  group: Group;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
}

export interface GroupSummary {
  group: Group;
  netCents: number; // current user's net in this group
}

export interface Db {
  getProfile(id: string): Promise<Profile | null>;
  updateProfile(id: string, patch: Partial<Profile>): Promise<void>;
  listGroups(meId: string): Promise<GroupSummary[]>;
  getGroup(groupId: string): Promise<GroupBundle>;
  createGroup(meId: string, name: string, description: string | null, currency: string): Promise<string>;
  listFriendDirectGroups(meId: string): Promise<GroupSummary[]>;
  addExpense(e: NewExpense): Promise<void>;
  deleteExpense(id: string): Promise<void>;
  addSettlement(s: Omit<Settlement, 'id' | 'created_at'> & { created_by: string }): Promise<void>;
  listComments(expenseId: string): Promise<Comment[]>;
  addComment(expenseId: string, userId: string, body: string): Promise<void>;
  listActivity(meId: string, groupId?: string): Promise<Activity[]>;
  inviteToGroup(groupId: string, email: string, invitedBy: string): Promise<void>;
}

/* ------------------------- DEMO (in-memory) ------------------------- */

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const mem = {
  profiles: clone(seed.demoProfiles),
  groups: clone(seed.demoGroups),
  members: clone(seed.demoMembers) as Record<string, string[]>,
  expenses: clone(seed.demoExpenses) as Expense[],
  settlements: clone(seed.demoSettlements) as Settlement[],
  comments: clone(seed.demoComments) as Comment[],
  activity: clone(seed.demoActivity) as Activity[]
};

const uid = () => 'x-' + Math.random().toString(36).slice(2, 10);
const profileById = (id: string) => mem.profiles.find((p) => p.id === id)!;

function netFor(meId: string, groupId: string): number {
  const exps = mem.expenses.filter((e) => e.group_id === groupId);
  const setts = mem.settlements.filter((s) => s.group_id === groupId);
  let net = 0;
  for (const e of exps) {
    if (e.paid_by === meId) net += e.amount_cents;
    const mine = e.splits.find((s) => s.user_id === meId);
    if (mine) net -= mine.amount_owed_cents;
  }
  for (const s of setts) {
    if (s.from_user === meId) net += s.amount_cents;
    if (s.to_user === meId) net -= s.amount_cents;
  }
  return net;
}

const demoDb: Db = {
  async getProfile(id) {
    return mem.profiles.find((p) => p.id === id) ?? null;
  },
  async updateProfile(id, patch) {
    Object.assign(profileById(id), patch);
  },
  async listGroups(meId) {
    return mem.groups
      .filter((g) => !g.is_direct && (mem.members[g.id] ?? []).includes(meId))
      .map((group) => ({ group, netCents: netFor(meId, group.id) }));
  },
  async getGroup(groupId) {
    const group = mem.groups.find((g) => g.id === groupId)!;
    const members: Member[] = (mem.members[groupId] ?? []).map((id) => ({
      ...profileById(id),
      role: group.created_by === id ? 'owner' : 'member'
    }));
    return {
      group,
      members,
      expenses: mem.expenses.filter((e) => e.group_id === groupId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      settlements: mem.settlements.filter((s) => s.group_id === groupId)
    };
  },
  async createGroup(meId, name, description, currency) {
    const id = uid();
    mem.groups.push({
      id, name, description, default_currency: currency, simplify_debts: true,
      is_direct: false, created_by: meId, created_at: new Date().toISOString()
    });
    mem.members[id] = [meId];
    return id;
  },
  async listFriendDirectGroups(meId) {
    return mem.groups
      .filter((g) => g.is_direct && (mem.members[g.id] ?? []).includes(meId))
      .map((group) => ({ group, netCents: netFor(meId, group.id) }));
  },
  async addExpense(e) {
    const id = uid();
    mem.expenses.push({
      id, group_id: e.group_id, paid_by: e.paid_by, created_by: e.paid_by,
      amount_cents: e.amount_cents, currency: e.currency, description: e.description,
      category: e.category, split_type: e.split_type, expense_date: e.expense_date,
      receipt_url: e.receipt_url ?? null, created_at: new Date().toISOString(),
      splits: e.splits.map((s) => ({
        user_id: s.user_id, amount_owed_cents: s.amount_owed_cents,
        shares: s.shares ?? null, percentage: s.percentage ?? null
      }))
    });
    mem.activity.unshift({
      id: uid(), group_id: e.group_id, actor_id: e.paid_by, type: 'expense_added',
      entity_id: id, metadata: { description: e.description, amount_cents: e.amount_cents },
      created_at: new Date().toISOString()
    });
  },
  async deleteExpense(id) {
    mem.expenses = mem.expenses.filter((e) => e.id !== id);
  },
  async addSettlement(s) {
    const id = uid();
    mem.settlements.push({
      id, group_id: s.group_id, from_user: s.from_user, to_user: s.to_user,
      amount_cents: s.amount_cents, currency: s.currency, note: s.note,
      created_at: new Date().toISOString()
    });
    mem.activity.unshift({
      id: uid(), group_id: s.group_id, actor_id: s.from_user, type: 'settlement',
      entity_id: id, metadata: { amount_cents: s.amount_cents, to_user: s.to_user },
      created_at: new Date().toISOString()
    });
  },
  async listComments(expenseId) {
    return mem.comments.filter((c) => c.expense_id === expenseId);
  },
  async addComment(expenseId, userId, body) {
    mem.comments.push({ id: uid(), expense_id: expenseId, user_id: userId, body, created_at: new Date().toISOString() });
  },
  async listActivity(_meId, groupId) {
    return mem.activity.filter((a) => (groupId ? a.group_id === groupId : true)).slice(0, 50);
  },
  async inviteToGroup() {
    /* demo: no-op (no email backend) */
  }
};

/* ------------------------- SUPABASE ------------------------- */

function sb() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

const EXPENSE_SELECT =
  '*, expense_splits(user_id, amount_owed_cents, shares, percentage)';

function rowToExpense(r: any): Expense {
  return {
    id: r.id, group_id: r.group_id, paid_by: r.paid_by, created_by: r.created_by,
    amount_cents: Number(r.amount_cents), currency: r.currency, description: r.description,
    category: r.category, split_type: r.split_type, expense_date: r.expense_date,
    receipt_url: r.receipt_url, created_at: r.created_at,
    splits: (r.expense_splits ?? []).map((s: any) => ({
      user_id: s.user_id, amount_owed_cents: Number(s.amount_owed_cents),
      shares: s.shares, percentage: s.percentage
    }))
  };
}

async function supaNet(meId: string, groupId: string): Promise<number> {
  const bundle = await supaDb.getGroup(groupId);
  let net = 0;
  for (const e of bundle.expenses) {
    if (e.paid_by === meId) net += e.amount_cents;
    const mine = e.splits.find((s) => s.user_id === meId);
    if (mine) net -= mine.amount_owed_cents;
  }
  for (const s of bundle.settlements) {
    if (s.from_user === meId) net += s.amount_cents;
    if (s.to_user === meId) net -= s.amount_cents;
  }
  return net;
}

const supaDb: Db = {
  async getProfile(id) {
    const { data, error } = await sb().from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  },
  async updateProfile(id, patch) {
    const { error } = await sb().from('profiles').update(patch).eq('id', id);
    if (error) throw error;
  },
  async listGroups(meId) {
    const { data: memberships, error } = await sb()
      .from('group_members').select('group_id, groups(*)').eq('user_id', meId);
    if (error) throw error;
    const groups = (memberships ?? [])
      .map((m: any) => m.groups as Group)
      .filter((g) => g && !g.is_direct);
    return Promise.all(groups.map(async (group) => ({ group, netCents: await supaNet(meId, group.id) })));
  },
  async getGroup(groupId) {
    const client = sb();
    const [{ data: group }, { data: gm }, { data: exp }, { data: setts }] = await Promise.all([
      client.from('groups').select('*').eq('id', groupId).single(),
      client.from('group_members').select('role, profiles(*)').eq('group_id', groupId),
      client.from('expenses').select(EXPENSE_SELECT).eq('group_id', groupId).is('deleted_at', null).order('created_at', { ascending: false }),
      client.from('settlements').select('*').eq('group_id', groupId)
    ]);
    const members: Member[] = (gm ?? []).map((m: any) => ({ ...(m.profiles as Profile), role: m.role }));
    return {
      group: group as Group,
      members,
      expenses: (exp ?? []).map(rowToExpense),
      settlements: (setts ?? []).map((s: any) => ({ ...s, amount_cents: Number(s.amount_cents) })) as Settlement[]
    };
  },
  async createGroup(meId, name, description, currency) {
    const client = sb();
    const { data, error } = await client.from('groups')
      .insert({ name, description, default_currency: currency, created_by: meId }).select('id').single();
    if (error) throw error;
    const id = (data as any).id as string;
    const { error: mErr } = await client.from('group_members').insert({ group_id: id, user_id: meId, role: 'owner' });
    if (mErr) throw mErr;
    return id;
  },
  async listFriendDirectGroups(meId) {
    const { data, error } = await sb()
      .from('group_members').select('group_id, groups(*)').eq('user_id', meId);
    if (error) throw error;
    const groups = (data ?? []).map((m: any) => m.groups as Group).filter((g) => g && g.is_direct);
    return Promise.all(groups.map(async (group) => ({ group, netCents: await supaNet(meId, group.id) })));
  },
  async addExpense(e) {
    const client = sb();
    const { data, error } = await client.from('expenses').insert({
      group_id: e.group_id, paid_by: e.paid_by, created_by: e.paid_by,
      amount_cents: e.amount_cents, currency: e.currency, description: e.description,
      category: e.category, split_type: e.split_type, expense_date: e.expense_date,
      receipt_url: e.receipt_url ?? null
    }).select('id').single();
    if (error) throw error;
    const expenseId = (data as any).id as string;
    const { error: sErr } = await client.from('expense_splits').insert(
      e.splits.map((s) => ({
        expense_id: expenseId, user_id: s.user_id, amount_owed_cents: s.amount_owed_cents,
        shares: s.shares ?? null, percentage: s.percentage ?? null
      }))
    );
    if (sErr) throw sErr;
    await client.from('activity').insert({
      group_id: e.group_id, actor_id: e.paid_by, type: 'expense_added',
      entity_id: expenseId, metadata: { description: e.description, amount_cents: e.amount_cents }
    });
  },
  async deleteExpense(id) {
    const { error } = await sb().from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
  async addSettlement(s) {
    const client = sb();
    const { error } = await client.from('settlements').insert({
      group_id: s.group_id, from_user: s.from_user, to_user: s.to_user,
      amount_cents: s.amount_cents, currency: s.currency, note: s.note, created_by: s.created_by
    });
    if (error) throw error;
    await client.from('activity').insert({
      group_id: s.group_id, actor_id: s.from_user, type: 'settlement',
      entity_id: null, metadata: { amount_cents: s.amount_cents, to_user: s.to_user }
    });
  },
  async listComments(expenseId) {
    const { data, error } = await sb().from('comments').select('*').eq('expense_id', expenseId).order('created_at');
    if (error) throw error;
    return (data ?? []) as Comment[];
  },
  async addComment(expenseId, userId, body) {
    const { error } = await sb().from('comments').insert({ expense_id: expenseId, user_id: userId, body });
    if (error) throw error;
  },
  async listActivity(_meId, groupId) {
    let q = sb().from('activity').select('*').order('created_at', { ascending: false }).limit(50);
    if (groupId) q = q.eq('group_id', groupId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Activity[];
  },
  async inviteToGroup(groupId, email, invitedBy) {
    const { error } = await sb().from('invitations').insert({ group_id: groupId, email, invited_by: invitedBy });
    if (error) throw error;
  }
} as Db;

export const db: Db = isConfigured ? supaDb : demoDb;
