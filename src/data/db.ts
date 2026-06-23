import { supabase, isConfigured } from '@/lib/supabase';
import type { Profile, Group, Member, Expense, Settlement, Comment, Activity, SplitType, Message, ChatMessage, AppNotification, MentionableExpense, Conversation, ChatPerson } from '@/types';
import { pairwiseEdges, pairwiseNetBetween, expenseNet } from '@/lib/balances';
import * as seed from './demoData';

export interface NewExpense {
  group_id: string;
  paid_by: string;
  actor_id?: string;   // who created the expense (may differ from paid_by); defaults to paid_by
  amount_cents: number;
  currency: string;
  description: string;
  category: string;
  split_type: SplitType;
  expense_date: string;
  receipt_url?: string | null;
  splits: { user_id: string; amount_owed_cents: number; shares?: number | null; percentage?: number | null }[];
  // optional explicit payers; if omitted, paid_by paid the full amount_cents
  payments?: { user_id: string; amount_cents: number }[];
}

// A no-group expense paid by ME and split with one or more friends.
// Recorded as one expense per friend in the direct (1-to-1) group with them,
// so every resulting debt is between me and that friend.
export interface PersonalSplit {
  currency: string;
  description: string;
  category: string;
  split_type: SplitType;
  expense_date: string;
  // each friend's share, in cents; my own share is not a debt and is omitted
  shares: { friend_id: string; friend_email: string; amount_owed_cents: number }[];
}

export interface GroupBundle {
  group: Group;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
}

export interface GroupSummary {
  group: Group;
  netCents: number;        // current user's net in this group
  lastActivityAt: string;  // newest expense/settlement time, or group.created_at — for sorting
}

export type NewSettlement = {
  group_id: string;
  from_user: string;
  to_user: string;
  amount_cents: number;
  currency: string;
  note: string | null;
  created_by: string;
};

export interface PendingSettlement {
  settlement: Settlement;
  group: Group;
  fromName: string;
  toName: string;
  direction: 'incoming' | 'outgoing'; // incoming = I need to confirm; outgoing = I'm waiting
}

export interface ActivityItem {
  id: string;
  type: string;
  createdAt: string;
  actorId: string | null;
  actorName: string;        // 'You' resolved by the screen
  groupId: string | null;
  groupLabel: string;       // group name, or 'Personal' for direct, or '—'
  isDirect: boolean;
  description: string;      // expense description or settlement note
  amountCents: number;      // total of the expense / settlement
  toUserId: string | null;  // for settlements
  toUserName: string | null;
  // For expense_added: who paid + each participant's share, so the screen can
  // show "you get back X" and a per-person breakdown.
  paidById: string | null;
  participants: { userId: string; name: string; owedCents: number }[];
}

export interface PersonBalance {
  person: Profile;
  totalNetCents: number; // + they owe me, - I owe them (summed across all shared groups)
  breakdown: { group: Group; netCents: number }[]; // per-group pairwise net, non-zero only
}

export interface Db {
  getProfile(id: string): Promise<Profile | null>;
  updateProfile(id: string, patch: Partial<Profile>): Promise<void>;
  listGroups(meId: string): Promise<GroupSummary[]>;
  getGroup(groupId: string): Promise<GroupBundle>;
  createGroup(meId: string, name: string, description: string | null, currency: string): Promise<string>;
  listFriendDirectGroups(meId: string): Promise<GroupSummary[]>;
  listFriends(meId: string): Promise<Profile[]>;
  removeFriend(meId: string, groupId: string): Promise<void>;
  listPeopleBalances(meId: string): Promise<PersonBalance[]>;
  addExpense(e: NewExpense): Promise<void>;
  addPersonalSplit(meId: string, p: PersonalSplit): Promise<void>;
  deleteExpense(id: string): Promise<void>;
  reopenExpense(id: string): Promise<void>;        // clear a legacy whole-expense settled/disputed flag
  // per-person (per-split) settle / dispute / reopen
  settleSplit(expenseId: string, userId: string): Promise<void>;
  disputeSplit(expenseId: string, userId: string): Promise<void>;
  reopenSplit(expenseId: string, userId: string): Promise<void>;
  addSettlement(s: NewSettlement): Promise<void>;       // records a confirmed payment immediately
  requestSettlement(s: NewSettlement): Promise<void>;   // debtor requests; pending until the creditor confirms
  confirmSettlement(id: string): Promise<void>;         // creditor (the one owed) confirms → settled
  disputeSettlement(id: string): Promise<void>;         // flag as wrong → excluded from balances until resolved
  deleteSettlement(id: string): Promise<void>;          // only the creditor may delete
  listPendingSettlements(meId: string): Promise<PendingSettlement[]>;
  listComments(expenseId: string): Promise<Comment[]>;
  addComment(expenseId: string, userId: string, body: string): Promise<void>;
  listActivityDetailed(meId: string): Promise<ActivityItem[]>;
  inviteToGroup(groupId: string, email: string, invitedBy: string): Promise<InviteResult>;
  addFriendByEmail(meId: string, email: string): Promise<string>;
  // membership management
  leaveGroup(meId: string, groupId: string): Promise<void>;
  deleteGroup(meId: string, groupId: string): Promise<void>;       // owner only
  removeMember(meId: string, groupId: string, userId: string): Promise<void>; // owner only
  // chat
  listMessages(groupId: string): Promise<ChatMessage[]>;
  sendMessage(meId: string, groupId: string, body: string, expenseId?: string | null): Promise<void>;
  // transactions that can be mentioned in this chat (direct chat = personal +
  // shared-group expenses with the other person; group chat = the group's expenses)
  listMentionableExpenses(meId: string, groupId: string): Promise<MentionableExpense[]>;
  // everyone I can 1-to-1 chat with (anyone I share any group with), with their
  // existing direct chat (if any). Used by the Chats inbox "People" list.
  listChatPeople(meId: string): Promise<ChatPerson[]>;
  // all my group conversations for the Chats inbox, newest first
  listConversations(meId: string): Promise<Conversation[]>;
  // notifications
  listNotifications(meId: string): Promise<AppNotification[]>;
  // kind: 'general' = expense/settlement only, 'message' = chat only, 'all' = both
  markNotificationsRead(meId: string, kind?: 'general' | 'message' | 'all'): Promise<void>;
  // clear unread chat alerts for one conversation (called when its chat is opened)
  markChatRead(meId: string, groupId: string): Promise<void>;
}

// 'added' = the person already had an account and is now a member.
// 'invited' = no account yet; they'll join automatically when they sign up.
export type InviteResult = { status: 'added' | 'invited' };

/* ------------------------- DEMO (in-memory) ------------------------- */

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const mem = {
  profiles: clone(seed.demoProfiles),
  groups: clone(seed.demoGroups),
  members: clone(seed.demoMembers) as Record<string, string[]>,
  expenses: clone(seed.demoExpenses) as Expense[],
  settlements: clone(seed.demoSettlements) as Settlement[],
  comments: clone(seed.demoComments) as Comment[],
  activity: clone(seed.demoActivity) as Activity[],
  messages: [] as Message[],
  notifications: [] as AppNotification[]
};

const uid = () => 'x-' + Math.random().toString(36).slice(2, 10);
const profileById = (id: string) => mem.profiles.find((p) => p.id === id)!;

function demoGetOrCreateDirect(meId: string, friendId: string): string {
  const existing = mem.groups.find(
    (g) => g.is_direct &&
      (mem.members[g.id] ?? []).includes(meId) &&
      (mem.members[g.id] ?? []).includes(friendId)
  );
  if (existing) return existing.id;
  const friend = profileById(friendId);
  const id = uid();
  mem.groups.push({
    id, name: friend.full_name || friend.email, description: null,
    default_currency: profileById(meId).preferred_currency, simplify_debts: true,
    is_direct: true, created_by: meId, created_at: new Date().toISOString()
  });
  mem.members[id] = [meId, friendId];
  return id;
}

function netFor(meId: string, groupId: string): number {
  const exps = mem.expenses.filter((e) => e.group_id === groupId);
  const setts = mem.settlements.filter((s) => s.group_id === groupId && s.status === 'confirmed');
  let net = 0;
  for (const e of exps) net += expenseNet(e).get(meId) ?? 0; // active-split aware
  for (const s of setts) {
    if (s.from_user === meId) net += s.amount_cents;
    if (s.to_user === meId) net -= s.amount_cents;
  }
  return net;
}

// newest expense/settlement time in a group, falling back to the group's creation time
function lastActivityFor(group: Group): string {
  let latest = group.created_at;
  for (const e of mem.expenses) if (e.group_id === group.id && e.created_at > latest) latest = e.created_at;
  for (const s of mem.settlements) if (s.group_id === group.id && s.created_at > latest) latest = s.created_at;
  return latest;
}

function demoInsertSettlement(s: NewSettlement, status: 'pending' | 'confirmed') {
  const id = uid();
  mem.settlements.push({
    id, group_id: s.group_id, from_user: s.from_user, to_user: s.to_user,
    amount_cents: s.amount_cents, currency: s.currency, note: s.note,
    status, created_by: s.created_by, created_at: new Date().toISOString()
  });
  if (status === 'confirmed') {
    mem.activity.unshift({
      id: uid(), group_id: s.group_id, actor_id: s.from_user, type: 'settlement',
      entity_id: id, metadata: { amount_cents: s.amount_cents, to_user: s.to_user },
      created_at: new Date().toISOString()
    });
  }
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
      .map((group) => ({ group, netCents: netFor(meId, group.id), lastActivityAt: lastActivityFor(group) }))
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
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
      .map((group) => ({ group, netCents: netFor(meId, group.id), lastActivityAt: lastActivityFor(group) }))
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  },
  async listFriends(meId) {
    const ids = new Set<string>();
    for (const g of mem.groups) {
      if (!g.is_direct) continue;
      const roster = mem.members[g.id] ?? [];
      if (!roster.includes(meId)) continue;
      for (const id of roster) if (id !== meId) ids.add(id);
    }
    return [...ids].map(profileById);
  },
  async removeFriend(meId, groupId) {
    const g = mem.groups.find((x) => x.id === groupId);
    if (!g || !g.is_direct) throw new Error('Not a friend');
    if (!(mem.members[groupId] ?? []).includes(meId)) throw new Error('Not your friend');
    if (netFor(meId, groupId) !== 0) throw new Error('Settle up before removing this friend.');
    mem.groups = mem.groups.filter((x) => x.id !== groupId);
    delete mem.members[groupId];
    mem.expenses = mem.expenses.filter((e) => e.group_id !== groupId);
    mem.settlements = mem.settlements.filter((s) => s.group_id !== groupId);
  },
  async listPeopleBalances(meId) {
    const myGroups = mem.groups.filter((g) => (mem.members[g.id] ?? []).includes(meId));
    const byPerson = new Map<string, PersonBalance>();
    for (const g of myGroups) {
      const exps = mem.expenses.filter((e) => e.group_id === g.id);
      const setts = mem.settlements.filter((s) => s.group_id === g.id);
      const edges = pairwiseEdges(exps, setts); // handles settled/disputed splits internally
      // a person counts as "shared" if there's any expense/settlement involving both of us
      const sharedWith = new Set<string>();
      for (const e of exps) {
        for (const p of (e.payments ?? [{ user_id: e.paid_by }])) sharedWith.add(p.user_id);
        for (const s of e.splits) sharedWith.add(s.user_id);
      }
      for (const s of setts) { sharedWith.add(s.from_user); sharedWith.add(s.to_user); }
      for (const otherId of (mem.members[g.id] ?? [])) {
        if (otherId === meId || !sharedWith.has(otherId)) continue;
        const net = pairwiseNetBetween(edges, meId, otherId);
        const entry = byPerson.get(otherId) ?? { person: profileById(otherId), totalNetCents: 0, breakdown: [] };
        entry.totalNetCents += net;
        if (net !== 0) entry.breakdown.push({ group: g, netCents: net });
        byPerson.set(otherId, entry);
      }
    }
    return [...byPerson.values()].sort((a, b) => Math.abs(b.totalNetCents) - Math.abs(a.totalNetCents));
  },
  async addExpense(e) {
    const id = uid();
    const actor = e.actor_id ?? e.paid_by;
    mem.expenses.push({
      id, group_id: e.group_id, paid_by: e.paid_by, created_by: actor,
      amount_cents: e.amount_cents, currency: e.currency, description: e.description,
      category: e.category, split_type: e.split_type, expense_date: e.expense_date,
      receipt_url: e.receipt_url ?? null, settled_at: null, disputed_at: null, created_at: new Date().toISOString(),
      splits: e.splits.map((s) => ({
        user_id: s.user_id, amount_owed_cents: s.amount_owed_cents,
        shares: s.shares ?? null, percentage: s.percentage ?? null,
        settled_at: null, disputed_at: null
      })),
      payments: e.payments && e.payments.length > 0
        ? e.payments.map((p) => ({ user_id: p.user_id, amount_cents: p.amount_cents }))
        : [{ user_id: e.paid_by, amount_cents: e.amount_cents }]
    });
    mem.activity.unshift({
      id: uid(), group_id: e.group_id, actor_id: actor, type: 'expense_added',
      entity_id: id, metadata: { description: e.description, amount_cents: e.amount_cents },
      created_at: new Date().toISOString()
    });
    // notify everyone involved except whoever logged it
    const involved = new Set<string>([...e.splits.map((s) => s.user_id), ...(e.payments ?? []).map((p) => p.user_id)]);
    involved.delete(actor);
    for (const uid2 of involved) {
      mem.notifications.unshift({
        id: uid(), user_id: uid2, actor_id: actor, type: 'expense_added',
        group_id: e.group_id, expense_id: id, read_at: null,
        body: `New expense "${e.description}" · ${e.currency} ${Math.round(e.amount_cents / 100)}`,
        created_at: new Date().toISOString()
      });
    }
  },
  async addPersonalSplit(meId, p) {
    for (const share of p.shares) {
      if (share.amount_owed_cents <= 0) continue;
      // resolve friend by id, falling back to email (parity with supaDb)
      const friendId = share.friend_id
        || mem.profiles.find((pr) => pr.email.toLowerCase() === share.friend_email.toLowerCase())?.id;
      if (!friendId) throw new Error('No Splitr user found with that email.');
      const gid = demoGetOrCreateDirect(meId, friendId);
      await demoDb.addExpense({
        group_id: gid, paid_by: meId, amount_cents: share.amount_owed_cents,
        currency: p.currency, description: p.description, category: p.category,
        split_type: p.split_type, expense_date: p.expense_date,
        splits: [{ user_id: friendId, amount_owed_cents: share.amount_owed_cents }]
      });
    }
  },
  async deleteExpense(id) {
    mem.expenses = mem.expenses.filter((e) => e.id !== id);
  },
  async reopenExpense(id) {
    const e = mem.expenses.find((x) => x.id === id);
    if (e) { e.settled_at = null; e.disputed_at = null; }
  },
  async settleSplit(expenseId, userId) {
    const s = mem.expenses.find((x) => x.id === expenseId)?.splits.find((sp) => sp.user_id === userId);
    if (s) { s.settled_at = new Date().toISOString(); s.disputed_at = null; }
  },
  async disputeSplit(expenseId, userId) {
    const s = mem.expenses.find((x) => x.id === expenseId)?.splits.find((sp) => sp.user_id === userId);
    if (s) { s.disputed_at = new Date().toISOString(); s.settled_at = null; }
  },
  async reopenSplit(expenseId, userId) {
    const s = mem.expenses.find((x) => x.id === expenseId)?.splits.find((sp) => sp.user_id === userId);
    if (s) { s.settled_at = null; s.disputed_at = null; }
  },
  async addSettlement(s) {
    demoInsertSettlement(s, 'confirmed');
  },
  async requestSettlement(s) {
    demoInsertSettlement(s, 'pending');
  },
  async confirmSettlement(id) {
    const s = mem.settlements.find((x) => x.id === id);
    if (!s) return;
    s.status = 'confirmed';
    mem.activity.unshift({
      id: uid(), group_id: s.group_id, actor_id: s.from_user, type: 'settlement',
      entity_id: id, metadata: { amount_cents: s.amount_cents, to_user: s.to_user },
      created_at: new Date().toISOString()
    });
  },
  async disputeSettlement(id) {
    const s = mem.settlements.find((x) => x.id === id);
    if (s) s.status = 'disputed';
  },
  async deleteSettlement(id) {
    mem.settlements = mem.settlements.filter((s) => s.id !== id);
  },
  async listPendingSettlements(meId) {
    return mem.settlements
      .filter((s) => (s.status === 'pending' || s.status === 'disputed') && (s.from_user === meId || s.to_user === meId))
      .map((s) => ({
        settlement: s,
        group: mem.groups.find((g) => g.id === s.group_id)!,
        fromName: profileById(s.from_user).full_name,
        toName: profileById(s.to_user).full_name,
        direction: (s.to_user === meId ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing'
      }));
  },
  async listComments(expenseId) {
    return mem.comments.filter((c) => c.expense_id === expenseId);
  },
  async addComment(expenseId, userId, body) {
    mem.comments.push({ id: uid(), expense_id: expenseId, user_id: userId, body, created_at: new Date().toISOString() });
  },
  async listActivityDetailed(meId) {
    const myGroupIds = new Set(
      mem.groups.filter((g) => (mem.members[g.id] ?? []).includes(meId)).map((g) => g.id)
    );
    const nameOf = (id: string | null) => (id ? (mem.profiles.find((p) => p.id === id)?.full_name ?? '—') : '—');
    return mem.activity
      .filter((a) => a.group_id && myGroupIds.has(a.group_id))
      .slice(0, 100)
      .map((a) => {
        const g = mem.groups.find((x) => x.id === a.group_id);
        const toUserId = (a.metadata.to_user as string) ?? null;
        const exp = a.type === 'expense_added' && a.entity_id
          ? mem.expenses.find((e) => e.id === a.entity_id) : undefined;
        return {
          id: a.id, type: a.type, createdAt: a.created_at,
          actorId: a.actor_id, actorName: nameOf(a.actor_id),
          groupId: a.group_id, isDirect: Boolean(g?.is_direct),
          groupLabel: g ? (g.is_direct ? 'Personal' : g.name) : '—',
          description: String(a.metadata.description ?? ''),
          amountCents: Number(a.metadata.amount_cents ?? 0),
          toUserId, toUserName: toUserId ? nameOf(toUserId) : null,
          paidById: exp?.paid_by ?? null,
          participants: exp ? exp.splits.map((s) => ({
            userId: s.user_id, name: nameOf(s.user_id), owedCents: s.amount_owed_cents
          })) : []
        };
      });
  },
  async inviteToGroup(groupId, email) {
    // Demo: if a profile with this email exists, add them straight away.
    const existing = mem.profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      const roster = mem.members[groupId] ?? (mem.members[groupId] = []);
      if (!roster.includes(existing.id)) roster.push(existing.id);
      return { status: 'added' };
    }
    return { status: 'invited' };
  },
  async addFriendByEmail(meId, email) {
    const friend = mem.profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (!friend) throw new Error('No Splitr user found with that email. Ask them to sign up first.');
    if (friend.id === meId) throw new Error('That’s your own email.');
    // Reuse an existing direct group between the two if there is one.
    const existing = mem.groups.find(
      (g) => g.is_direct &&
        (mem.members[g.id] ?? []).includes(meId) &&
        (mem.members[g.id] ?? []).includes(friend.id)
    );
    if (existing) return existing.id;
    const id = uid();
    mem.groups.push({
      id, name: friend.full_name || friend.email, description: null,
      default_currency: profileById(meId).preferred_currency, simplify_debts: true,
      is_direct: true, created_by: meId, created_at: new Date().toISOString()
    });
    mem.members[id] = [meId, friend.id];
    return id;
  },
  async leaveGroup(meId, groupId) {
    mem.members[groupId] = (mem.members[groupId] ?? []).filter((u) => u !== meId);
  },
  async deleteGroup(meId, groupId) {
    const g = mem.groups.find((x) => x.id === groupId);
    if (!g) return;
    if (g.created_by !== meId) throw new Error('Only the group owner can delete this group.');
    mem.groups = mem.groups.filter((x) => x.id !== groupId);
    delete mem.members[groupId];
    mem.expenses = mem.expenses.filter((e) => e.group_id !== groupId);
    mem.settlements = mem.settlements.filter((s) => s.group_id !== groupId);
    mem.messages = mem.messages.filter((m) => m.group_id !== groupId);
  },
  async removeMember(meId, groupId, userId) {
    const g = mem.groups.find((x) => x.id === groupId);
    if (!g || g.created_by !== meId) throw new Error('Only the group owner can remove members.');
    if (userId === meId) throw new Error('Use “Leave group” to remove yourself.');
    mem.members[groupId] = (mem.members[groupId] ?? []).filter((u) => u !== userId);
  },
  async listMessages(groupId) {
    return mem.messages
      .filter((m) => m.group_id === groupId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => {
        const exp = m.expense_id ? mem.expenses.find((e) => e.id === m.expense_id) : null;
        return {
          ...m,
          senderName: profileById(m.user_id)?.full_name ?? '—',
          mention: exp ? { id: exp.id, description: exp.description, amountCents: exp.amount_cents, currency: exp.currency, groupId: exp.group_id } : null
        } as ChatMessage;
      });
  },
  async listMentionableExpenses(meId, groupId) {
    const chat = mem.groups.find((g) => g.id === groupId);
    if (!chat) return [];
    const toItem = (e: Expense, g: Group): MentionableExpense => ({
      id: e.id, description: e.description, amountCents: e.amount_cents, currency: e.currency,
      category: e.category, groupId: g.id, groupLabel: g.is_direct ? 'Personal' : g.name, date: e.created_at
    });
    if (!chat.is_direct) {
      return mem.expenses
        .filter((e) => e.group_id === groupId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((e) => toItem(e, chat));
    }
    // direct chat: every expense involving BOTH of us, across all shared groups
    const otherId = (mem.members[groupId] ?? []).find((u) => u !== meId) ?? null;
    const sharedGroups = mem.groups.filter((g) =>
      (mem.members[g.id] ?? []).includes(meId) && (!otherId || (mem.members[g.id] ?? []).includes(otherId)));
    const out: MentionableExpense[] = [];
    for (const g of sharedGroups) {
      for (const e of mem.expenses.filter((e) => e.group_id === g.id)) {
        const involved = new Set<string>([e.paid_by, ...e.splits.map((s) => s.user_id), ...(e.payments ?? []).map((p) => p.user_id)]);
        if (involved.has(meId) && (!otherId || involved.has(otherId))) out.push(toItem(e, g));
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  },
  async sendMessage(meId, groupId, body, expenseId) {
    mem.messages.push({
      id: uid(), group_id: groupId, user_id: meId, body,
      expense_id: expenseId ?? null, created_at: new Date().toISOString()
    });
    // notify other members (in-app + push) — WhatsApp-style "Name: preview"
    const senderName = profileById(meId)?.full_name || 'Someone';
    const preview = (expenseId && (!body || body === '📎 expense'))
      ? 'sent an expense'
      : (body.length > 80 ? body.slice(0, 79) + '…' : body);
    for (const memberId of (mem.members[groupId] ?? [])) {
      if (memberId === meId) continue;
      mem.notifications.unshift({
        id: uid(), user_id: memberId, actor_id: meId, type: 'message',
        group_id: groupId, expense_id: expenseId ?? null, read_at: null,
        body: `${senderName}: ${preview}`, created_at: new Date().toISOString()
      });
    }
  },
  async listChatPeople(meId) {
    // everyone I share ANY group with (direct or regular)
    const peopleIds = new Set<string>();
    for (const g of mem.groups) {
      const roster = mem.members[g.id] ?? [];
      if (!roster.includes(meId)) continue;
      for (const u of roster) if (u !== meId) peopleIds.add(u);
    }
    return [...peopleIds]
      .map((pid) => {
        const direct = mem.groups.find((g) => g.is_direct
          && (mem.members[g.id] ?? []).includes(meId) && (mem.members[g.id] ?? []).includes(pid));
        const dg = direct?.id ?? null;
        const msgs = dg
          ? mem.messages.filter((m) => m.group_id === dg).sort((a, b) => b.created_at.localeCompare(a.created_at))
          : [];
        const last = msgs[0] ?? null;
        const unread = dg
          ? mem.notifications.filter((n) => n.user_id === meId && n.type === 'message' && n.group_id === dg && !n.read_at).length
          : 0;
        const p = profileById(pid);
        return {
          id: pid, name: p.full_name || p.email, email: p.email,
          directGroupId: dg, lastMessage: last ? last.body : null, lastAt: last ? last.created_at : null, unread
        } as ChatPerson;
      })
      .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name));
  },
  async listConversations(meId) {
    const myGroups = mem.groups.filter((g) => !g.is_direct && (mem.members[g.id] ?? []).includes(meId));
    return myGroups
      .map((g) => {
        const msgs = mem.messages
          .filter((m) => m.group_id === g.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        const last = msgs[0] ?? null;
        const otherId = g.is_direct ? ((mem.members[g.id] ?? []).find((u) => u !== meId) ?? null) : null;
        const unread = mem.notifications.filter(
          (n) => n.user_id === meId && n.type === 'message' && n.group_id === g.id && !n.read_at
        ).length;
        return {
          groupId: g.id,
          title: g.is_direct ? (otherId ? profileById(otherId).full_name : g.name) : g.name,
          isDirect: g.is_direct,
          avatarId: otherId ?? g.id,
          lastMessage: last ? last.body : null,
          lastAt: last ? last.created_at : null,
          unread
        } as Conversation;
      })
      .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  },
  async listNotifications(meId) {
    return mem.notifications
      .filter((n) => n.user_id === meId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async markNotificationsRead(meId, kind = 'all') {
    const now = new Date().toISOString();
    for (const n of mem.notifications) {
      if (n.user_id !== meId || n.read_at) continue;
      if (kind === 'general' && n.type === 'message') continue;
      if (kind === 'message' && n.type !== 'message') continue;
      n.read_at = now;
    }
  },
  async markChatRead(meId, groupId) {
    const now = new Date().toISOString();
    for (const n of mem.notifications) {
      if (n.user_id === meId && n.type === 'message' && n.group_id === groupId && !n.read_at) n.read_at = now;
    }
  }
};

/* ------------------------- SUPABASE ------------------------- */

function sb() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

const EXPENSE_SELECT =
  '*, expense_splits(user_id, amount_owed_cents, shares, percentage, settled_at, disputed_at), expense_payments(user_id, amount_cents)';

function rowToExpense(r: any): Expense {
  const payments = (r.expense_payments ?? []).map((p: any) => ({
    user_id: p.user_id, amount_cents: Number(p.amount_cents)
  }));
  return {
    id: r.id, group_id: r.group_id, paid_by: r.paid_by, created_by: r.created_by,
    amount_cents: Number(r.amount_cents), currency: r.currency, description: r.description,
    category: r.category, split_type: r.split_type, expense_date: r.expense_date,
    receipt_url: r.receipt_url, settled_at: r.settled_at ?? null, disputed_at: r.disputed_at ?? null, created_at: r.created_at,
    splits: (r.expense_splits ?? []).map((s: any) => ({
      user_id: s.user_id, amount_owed_cents: Number(s.amount_owed_cents),
      shares: s.shares, percentage: s.percentage,
      settled_at: s.settled_at ?? null, disputed_at: s.disputed_at ?? null
    })),
    // fall back to single primary payer if no explicit payment rows
    payments: payments.length > 0 ? payments : [{ user_id: r.paid_by, amount_cents: Number(r.amount_cents) }]
  };
}

// one bundle fetch → both the user's net and the group's last-activity time
async function supaSummary(meId: string, group: Group): Promise<GroupSummary> {
  const bundle = await supaDb.getGroup(group.id);
  let net = 0;
  let lastActivityAt = group.created_at;
  for (const e of bundle.expenses) {
    net += expenseNet(e).get(meId) ?? 0; // active-split aware
    if (e.created_at > lastActivityAt) lastActivityAt = e.created_at;
  }
  for (const s of bundle.settlements) {
    if (s.created_at > lastActivityAt) lastActivityAt = s.created_at;
    if (s.status !== 'confirmed') continue;
    if (s.from_user === meId) net += s.amount_cents;
    if (s.to_user === meId) net -= s.amount_cents;
  }
  return { group, netCents: net, lastActivityAt };
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
    const summaries = await Promise.all(groups.map((group) => supaSummary(meId, group)));
    return summaries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
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
    const summaries = await Promise.all(groups.map((group) => supaSummary(meId, group)));
    return summaries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  },
  async listFriends(meId) {
    const client = sb();
    // my direct groups
    const { data: mine, error } = await client
      .from('group_members').select('group_id, groups(is_direct)').eq('user_id', meId);
    if (error) throw error;
    const directGroupIds = (mine ?? [])
      .filter((m: any) => m.groups?.is_direct)
      .map((m: any) => m.group_id as string);
    if (directGroupIds.length === 0) return [];
    // the other members of those groups
    const { data: rows, error: e2 } = await client
      .from('group_members').select('user_id, profiles(*)').in('group_id', directGroupIds);
    if (e2) throw e2;
    const byId = new Map<string, Profile>();
    for (const r of rows ?? []) {
      const p = (r as any).profiles as Profile;
      if (p && p.id !== meId) byId.set(p.id, p);
    }
    return [...byId.values()];
  },
  async removeFriend(_meId, groupId) {
    const { error } = await sb().rpc('remove_friend', { p_group_id: groupId });
    if (error) throw error;
  },
  async listPeopleBalances(meId) {
    const client = sb();
    const { data: memberships, error } = await client
      .from('group_members').select('group_id, groups(*)').eq('user_id', meId);
    if (error) throw error;
    const groups = (memberships ?? []).map((m: any) => m.groups as Group).filter(Boolean);
    const bundles = await Promise.all(groups.map((g) => supaDb.getGroup(g.id)));
    const byPerson = new Map<string, PersonBalance>();
    for (const bundle of bundles) {
      const edges = pairwiseEdges(bundle.expenses, bundle.settlements); // skips settled
      // a person counts as "shared" if there's any expense/settlement involving both of us
      const sharedWith = new Set<string>();
      for (const e of bundle.expenses) {
        for (const p of (e.payments && e.payments.length > 0 ? e.payments : [{ user_id: e.paid_by }])) sharedWith.add(p.user_id);
        for (const s of e.splits) sharedWith.add(s.user_id);
      }
      for (const s of bundle.settlements) { sharedWith.add(s.from_user); sharedWith.add(s.to_user); }
      for (const other of bundle.members) {
        if (other.id === meId || !sharedWith.has(other.id)) continue;
        const net = pairwiseNetBetween(edges, meId, other.id);
        const entry = byPerson.get(other.id)
          ?? { person: other as Profile, totalNetCents: 0, breakdown: [] };
        entry.totalNetCents += net;
        if (net !== 0) entry.breakdown.push({ group: bundle.group, netCents: net });
        byPerson.set(other.id, entry);
      }
    }
    return [...byPerson.values()].sort((a, b) => Math.abs(b.totalNetCents) - Math.abs(a.totalNetCents));
  },
  async addExpense(e) {
    const client = sb();
    const actor = e.actor_id ?? e.paid_by; // who is logging this expense
    const { data, error } = await client.from('expenses').insert({
      group_id: e.group_id, paid_by: e.paid_by, created_by: actor,
      amount_cents: e.amount_cents, currency: e.currency, description: e.description,
      category: e.category, split_type: e.split_type, expense_date: e.expense_date,
      receipt_url: e.receipt_url ?? null
    }).select('id').single();
    if (error) throw error;
    const expenseId = (data as any).id as string;
    // If splits or payments fail, hard-delete the orphan expense so balances aren't skewed.
    try {
      const { error: sErr } = await client.from('expense_splits').insert(
        e.splits.map((s) => ({
          expense_id: expenseId, user_id: s.user_id, amount_owed_cents: s.amount_owed_cents,
          shares: s.shares ?? null, percentage: s.percentage ?? null
        }))
      );
      if (sErr) throw sErr;
      const payments = e.payments && e.payments.length > 0
        ? e.payments.filter((p) => p.amount_cents > 0)
        : [{ user_id: e.paid_by, amount_cents: e.amount_cents }];
      const { error: pErr } = await client.from('expense_payments').insert(
        payments.map((p) => ({ expense_id: expenseId, user_id: p.user_id, amount_cents: p.amount_cents }))
      );
      if (pErr) throw pErr;
    } catch (err) {
      await client.from('expenses').delete().eq('id', expenseId); // roll back the orphan
      throw err;
    }
    // activity + notifications are best-effort; a failure here must not orphan the expense
    await client.from('activity').insert({
      group_id: e.group_id, actor_id: actor, type: 'expense_added',
      entity_id: expenseId, metadata: { description: e.description, amount_cents: e.amount_cents }
    });
    // notify everyone involved (split users + payers) except whoever logged it
    const involved = new Set<string>([...e.splits.map((s) => s.user_id), ...(e.payments ?? []).map((p) => p.user_id)]);
    involved.delete(actor);
    if (involved.size > 0) {
      await client.from('notifications').insert([...involved].map((uid2) => ({
        user_id: uid2, actor_id: actor, type: 'expense_added',
        group_id: e.group_id, expense_id: expenseId,
        body: `New expense "${e.description}" · ${e.currency} ${Math.round(e.amount_cents / 100)}`
      }))).then(() => {}, () => {}); // ignore notification failures
    }
  },
  async addPersonalSplit(meId, p) {
    for (const share of p.shares) {
      if (share.amount_owed_cents <= 0) continue;
      // get-or-create the direct group between me and this friend
      const gid = await supaDb.addFriendByEmail(meId, share.friend_email);
      await supaDb.addExpense({
        group_id: gid, paid_by: meId, amount_cents: share.amount_owed_cents,
        currency: p.currency, description: p.description, category: p.category,
        split_type: p.split_type, expense_date: p.expense_date,
        splits: [{ user_id: share.friend_id, amount_owed_cents: share.amount_owed_cents }]
      });
    }
  },
  async deleteExpense(id) {
    const { error } = await sb().from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
  async reopenExpense(id) {
    const { error } = await sb().from('expenses').update({ settled_at: null, disputed_at: null }).eq('id', id);
    if (error) throw error;
  },
  async settleSplit(expenseId, userId) {
    const { error } = await sb().from('expense_splits')
      .update({ settled_at: new Date().toISOString(), disputed_at: null })
      .eq('expense_id', expenseId).eq('user_id', userId);
    if (error) throw error;
  },
  async disputeSplit(expenseId, userId) {
    const { error } = await sb().from('expense_splits')
      .update({ disputed_at: new Date().toISOString(), settled_at: null })
      .eq('expense_id', expenseId).eq('user_id', userId);
    if (error) throw error;
  },
  async reopenSplit(expenseId, userId) {
    const { error } = await sb().from('expense_splits')
      .update({ settled_at: null, disputed_at: null })
      .eq('expense_id', expenseId).eq('user_id', userId);
    if (error) throw error;
  },
  async addSettlement(s) {
    const client = sb();
    const { error } = await client.from('settlements').insert({
      group_id: s.group_id, from_user: s.from_user, to_user: s.to_user,
      amount_cents: s.amount_cents, currency: s.currency, note: s.note,
      created_by: s.created_by, status: 'confirmed'
    });
    if (error) throw error;
    await client.from('activity').insert({
      group_id: s.group_id, actor_id: s.from_user, type: 'settlement',
      entity_id: null, metadata: { amount_cents: s.amount_cents, to_user: s.to_user }
    });
  },
  async requestSettlement(s) {
    const client = sb();
    const { error } = await client.from('settlements').insert({
      group_id: s.group_id, from_user: s.from_user, to_user: s.to_user,
      amount_cents: s.amount_cents, currency: s.currency, note: s.note,
      created_by: s.created_by, status: 'pending'
    });
    if (error) throw error;
    // notify the person who must confirm (the creditor / to_user)
    await client.from('notifications').insert({
      user_id: s.to_user, actor_id: s.from_user, type: 'settlement', group_id: s.group_id,
      body: `Settle-up request · ${s.currency} ${Math.round(s.amount_cents / 100)} — confirm if received`
    }).then(() => {}, () => {});
  },
  async confirmSettlement(id) {
    const client = sb();
    const { data, error } = await client.from('settlements')
      .update({ status: 'confirmed' }).eq('id', id).select('*').single();
    if (error) throw error;
    const s = data as any;
    await client.from('activity').insert({
      group_id: s.group_id, actor_id: s.from_user, type: 'settlement',
      entity_id: s.id, metadata: { amount_cents: Number(s.amount_cents), to_user: s.to_user }
    });
    // notify the payer that their settle-up was confirmed
    await client.from('notifications').insert({
      user_id: s.from_user, actor_id: s.to_user, type: 'settlement', group_id: s.group_id,
      body: `Your settle-up of ${s.currency} ${Math.round(Number(s.amount_cents) / 100)} was confirmed`
    }).then(() => {}, () => {});
  },
  async disputeSettlement(id) {
    const { error } = await sb().from('settlements').update({ status: 'disputed' }).eq('id', id);
    if (error) throw error;
  },
  async deleteSettlement(id) {
    const { error } = await sb().from('settlements').delete().eq('id', id);
    if (error) throw error;
  },
  async listPendingSettlements(meId) {
    const client = sb();
    const { data, error } = await client.from('settlements')
      .select('*').in('status', ['pending', 'disputed']).order('created_at', { ascending: false });
    if (error) throw error;
    const rows = ((data ?? []) as any[])
      .map((s) => ({ ...s, amount_cents: Number(s.amount_cents) }) as Settlement)
      .filter((s) => s.from_user === meId || s.to_user === meId);
    const groupIds = [...new Set(rows.map((r) => r.group_id))];
    const userIds = [...new Set(rows.flatMap((r) => [r.from_user, r.to_user]))];
    const [{ data: gs }, { data: ps }] = await Promise.all([
      groupIds.length ? client.from('groups').select('*').in('id', groupIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? client.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] as any[] })
    ]);
    const groupMap = new Map((gs ?? []).map((g: any) => [g.id, g as Group]));
    const nameMap = new Map((ps ?? []).map((p: any) => [p.id, p.full_name as string]));
    return rows.map((s) => ({
      settlement: s,
      group: groupMap.get(s.group_id)!,
      fromName: nameMap.get(s.from_user) ?? '—',
      toName: nameMap.get(s.to_user) ?? '—',
      direction: (s.to_user === meId ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing'
    }));
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
  async listActivityDetailed(meId) {
    const client = sb();
    // when I joined each group → I only see activity from then on
    const { data: mems } = await client.from('group_members')
      .select('group_id, joined_at').eq('user_id', meId);
    const joinedAt = new Map<string, string>((mems ?? []).map((m: any) => [m.group_id, m.joined_at]));
    // RLS already limits activity rows to groups I belong to.
    const { data, error } = await client.from('activity')
      .select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    const rows = ((data ?? []) as Activity[]).filter((a) => {
      const j = a.group_id ? joinedAt.get(a.group_id) : undefined;
      return !j || a.created_at >= j; // hide activity from before I joined
    }).slice(0, 100);

    // fetch the referenced expenses (with splits) so we can show per-person shares
    const expenseIds = rows
      .filter((r) => r.type === 'expense_added' && r.entity_id)
      .map((r) => r.entity_id as string);
    const { data: exps } = expenseIds.length
      ? await client.from('expenses').select(EXPENSE_SELECT).in('id', expenseIds)
      : { data: [] as any[] };
    const expMap = new Map((exps ?? []).map((e: any) => [e.id, rowToExpense(e)]));

    const groupIds = [...new Set(rows.map((r) => r.group_id).filter(Boolean))] as string[];
    const userIds = [...new Set([
      ...rows.flatMap((r) => [r.actor_id, (r.metadata?.to_user as string) ?? null]),
      ...[...expMap.values()].flatMap((e) => e.splits.map((s) => s.user_id))
    ].filter(Boolean))] as string[];
    const [{ data: gs }, { data: ps }] = await Promise.all([
      groupIds.length ? client.from('groups').select('id, name, is_direct').in('id', groupIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? client.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] as any[] })
    ]);
    const groupMap = new Map((gs ?? []).map((g: any) => [g.id, g]));
    const nameMap = new Map((ps ?? []).map((p: any) => [p.id, p.full_name as string]));
    const nameOf = (id: string | null) => (id ? (nameMap.get(id) ?? '—') : '—');
    return rows.map((a) => {
      const g = a.group_id ? groupMap.get(a.group_id) : null;
      const toUserId = (a.metadata?.to_user as string) ?? null;
      const exp = a.type === 'expense_added' && a.entity_id ? expMap.get(a.entity_id) : undefined;
      return {
        id: a.id, type: a.type, createdAt: a.created_at,
        actorId: a.actor_id, actorName: nameOf(a.actor_id),
        groupId: a.group_id, isDirect: Boolean(g?.is_direct),
        groupLabel: g ? (g.is_direct ? 'Personal' : g.name) : '—',
        description: String(a.metadata?.description ?? ''),
        amountCents: Number(a.metadata?.amount_cents ?? 0),
        toUserId, toUserName: toUserId ? nameOf(toUserId) : null,
        paidById: exp?.paid_by ?? null,
        participants: exp ? exp.splits.map((s) => ({
          userId: s.user_id, name: nameOf(s.user_id), owedCents: s.amount_owed_cents
        })) : []
      };
    });
  },
  async inviteToGroup(groupId, email) {
    // RPC adds the user immediately if they already have an account; otherwise
    // it records an invitation that the new-user trigger claims at sign-up.
    // The inviter is taken from auth.uid() server-side (not trusted from here).
    const { data, error } = await sb().rpc('invite_to_group', {
      p_group_id: groupId, p_email: email.trim().toLowerCase()
    });
    if (error) throw error;
    return { status: (data as string) === 'added' ? 'added' : 'invited' };
  },
  async addFriendByEmail(_meId, email) {
    const { data, error } = await sb().rpc('add_friend_by_email', { p_email: email.trim().toLowerCase() });
    if (error) throw error;
    return data as string; // the direct group's id
  },
  async leaveGroup(meId, groupId) {
    const { error } = await sb().from('group_members').delete()
      .eq('group_id', groupId).eq('user_id', meId);
    if (error) throw error;
  },
  async deleteGroup(_meId, groupId) {
    // RLS groups_delete restricts this to the creator/owner.
    const { error } = await sb().from('groups').delete().eq('id', groupId);
    if (error) throw error;
  },
  async removeMember(_meId, groupId, userId) {
    // RLS gm_delete allows the owner to remove others.
    const { error } = await sb().from('group_members').delete()
      .eq('group_id', groupId).eq('user_id', userId);
    if (error) throw error;
  },
  async listMessages(groupId) {
    const client = sb();
    const { data, error } = await client.from('messages')
      .select('*').eq('group_id', groupId).order('created_at', { ascending: true }).limit(500);
    if (error) throw error;
    const rows = (data ?? []) as Message[];
    const userIds = [...new Set(rows.map((m) => m.user_id))];
    const expenseIds = [...new Set(rows.map((m) => m.expense_id).filter(Boolean))] as string[];
    const [{ data: ps }, { data: exps }] = await Promise.all([
      userIds.length ? client.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
      expenseIds.length ? client.from('expenses').select('id, group_id, description, amount_cents, currency').in('id', expenseIds) : Promise.resolve({ data: [] as any[] })
    ]);
    const nameMap = new Map((ps ?? []).map((p: any) => [p.id, p.full_name as string]));
    const expMap = new Map((exps ?? []).map((e: any) => [e.id, e]));
    return rows.map((m) => {
      const e = m.expense_id ? expMap.get(m.expense_id) : null;
      return {
        ...m,
        senderName: nameMap.get(m.user_id) ?? '—',
        mention: e ? { id: e.id, description: e.description, amountCents: Number(e.amount_cents), currency: e.currency, groupId: e.group_id } : null
      } as ChatMessage;
    });
  },
  async listMentionableExpenses(meId, groupId) {
    const client = sb();
    const { data: chat } = await client.from('groups').select('id, name, is_direct').eq('id', groupId).single();
    const chatGroup = chat as { id: string; name: string; is_direct: boolean } | null;
    if (!chatGroup) return [];

    // group chat → just this group's transactions
    if (!chatGroup.is_direct) {
      const { data: exp } = await client.from('expenses')
        .select(EXPENSE_SELECT).eq('group_id', groupId).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(300);
      return (exp ?? []).map(rowToExpense).map((e) => ({
        id: e.id, description: e.description, amountCents: e.amount_cents, currency: e.currency,
        category: e.category, groupId: e.group_id, groupLabel: chatGroup.name, date: e.created_at
      }));
    }

    // direct chat → personal + every shared group with the other person
    const { data: roster } = await client.from('group_members').select('user_id').eq('group_id', groupId);
    const otherId = (roster ?? []).map((r: any) => r.user_id as string).find((u) => u !== meId) ?? null;
    const { data: mine } = await client.from('group_members').select('group_id').eq('user_id', meId);
    const myGroupIds = [...new Set((mine ?? []).map((m: any) => m.group_id as string))];
    if (myGroupIds.length === 0) return [];
    let sharedIds = [groupId];
    if (otherId) {
      const { data: shared } = await client.from('group_members')
        .select('group_id').eq('user_id', otherId).in('group_id', myGroupIds);
      sharedIds = [...new Set([groupId, ...((shared ?? []).map((s: any) => s.group_id as string))])];
    }
    const [{ data: gs }, { data: exps }] = await Promise.all([
      client.from('groups').select('id, name, is_direct').in('id', sharedIds),
      client.from('expenses').select(EXPENSE_SELECT).in('group_id', sharedIds).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(300)
    ]);
    const gmap = new Map((gs ?? []).map((g: any) => [g.id, g as { id: string; name: string; is_direct: boolean }]));
    const out: MentionableExpense[] = [];
    for (const row of exps ?? []) {
      const e = rowToExpense(row);
      const involved = new Set<string>([e.paid_by, ...e.splits.map((s) => s.user_id), ...e.payments.map((p) => p.user_id)]);
      if (!involved.has(meId)) continue;
      if (otherId && !involved.has(otherId)) continue;
      const g = gmap.get(e.group_id);
      out.push({
        id: e.id, description: e.description, amountCents: e.amount_cents, currency: e.currency,
        category: e.category, groupId: e.group_id,
        groupLabel: g ? (g.is_direct ? 'Personal' : g.name) : 'Group', date: e.created_at
      });
    }
    return out;
  },
  async sendMessage(meId, groupId, body, expenseId) {
    const client = sb();
    const { error } = await client.from('messages').insert({
      group_id: groupId, user_id: meId, body, expense_id: expenseId ?? null
    });
    if (error) throw error;
    // notify other group members so they get an in-app + push notification (best-effort)
    const { data: members } = await client.from('group_members').select('user_id').eq('group_id', groupId);
    const recipients = (members ?? []).map((m: any) => m.user_id as string).filter((u) => u !== meId);
    if (recipients.length > 0) {
      const { data: meProfile } = await client.from('profiles').select('full_name').eq('id', meId).maybeSingle();
      const senderName = (meProfile?.full_name || 'Someone').trim();
      const preview = (expenseId && (!body || body === '📎 expense'))
        ? 'sent an expense'
        : (body.length > 80 ? body.slice(0, 79) + '…' : body);
      await client.from('notifications').insert(
        recipients.map((u) => ({
          user_id: u, actor_id: meId, type: 'message',
          group_id: groupId, expense_id: expenseId ?? null, body: `${senderName}: ${preview}`
        }))
      ).then(() => {}, () => {}); // never block the send on a notification failure
    }
  },
  async listChatPeople(meId) {
    const client = sb();
    const { data: mems, error } = await client
      .from('group_members').select('group_id, groups(is_direct)').eq('user_id', meId);
    if (error) throw error;
    const myGroupIds = [...new Set((mems ?? []).map((m: any) => m.group_id as string))];
    if (myGroupIds.length === 0) return [];
    const directGroupIds = new Set((mems ?? []).filter((m: any) => m.groups?.is_direct).map((m: any) => m.group_id as string));

    // everyone in my groups + which direct group maps to which person
    const { data: rows } = await client
      .from('group_members').select('group_id, profiles(*)').in('group_id', myGroupIds);
    const people = new Map<string, Profile>();
    const directByPerson = new Map<string, string>();
    for (const r of (rows ?? []) as any[]) {
      const p = r.profiles as Profile;
      if (!p || p.id === meId) continue;
      people.set(p.id, p);
      if (directGroupIds.has(r.group_id)) directByPerson.set(p.id, r.group_id);
    }
    if (people.size === 0) return [];

    const dGroupIds = [...directByPerson.values()];
    const [{ data: msgs }, { data: notifs }] = await Promise.all([
      dGroupIds.length
        ? client.from('messages').select('group_id, body, created_at').in('group_id', dGroupIds).order('created_at', { ascending: false }).limit(400)
        : Promise.resolve({ data: [] as any[] }),
      client.from('notifications').select('group_id').eq('user_id', meId).eq('type', 'message').is('read_at', null)
    ]);
    const lastByGroup = new Map<string, { body: string; created_at: string }>();
    for (const m of (msgs ?? []) as any[]) if (!lastByGroup.has(m.group_id)) lastByGroup.set(m.group_id, { body: m.body, created_at: m.created_at });
    const unreadByGroup = new Map<string, number>();
    for (const n of (notifs ?? []) as any[]) if (n.group_id) unreadByGroup.set(n.group_id, (unreadByGroup.get(n.group_id) ?? 0) + 1);

    return [...people.values()]
      .map((p) => {
        const dg = directByPerson.get(p.id) ?? null;
        const last = dg ? lastByGroup.get(dg) ?? null : null;
        return {
          id: p.id, name: p.full_name || p.email, email: p.email,
          directGroupId: dg, lastMessage: last ? last.body : null, lastAt: last ? last.created_at : null,
          unread: dg ? (unreadByGroup.get(dg) ?? 0) : 0
        } as ChatPerson;
      })
      .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name));
  },
  async listConversations(meId) {
    const client = sb();
    const { data: mems, error } = await client
      .from('group_members').select('group_id, groups(*)').eq('user_id', meId);
    if (error) throw error;
    const groups = (mems ?? []).map((m: any) => m.groups as Group).filter((g) => g && !g.is_direct);
    if (groups.length === 0) return [];
    const groupIds = groups.map((g) => g.id);
    const [{ data: msgs }, { data: notifs }] = await Promise.all([
      client.from('messages').select('group_id, body, created_at')
        .in('group_id', groupIds).order('created_at', { ascending: false }).limit(400),
      client.from('notifications').select('group_id')
        .eq('user_id', meId).eq('type', 'message').is('read_at', null)
    ]);
    const lastByGroup = new Map<string, { body: string; created_at: string }>();
    for (const m of (msgs ?? []) as any[]) if (!lastByGroup.has(m.group_id)) lastByGroup.set(m.group_id, { body: m.body, created_at: m.created_at });
    const unreadByGroup = new Map<string, number>();
    for (const n of (notifs ?? []) as any[]) if (n.group_id) unreadByGroup.set(n.group_id, (unreadByGroup.get(n.group_id) ?? 0) + 1);
    return groups
      .map((g) => {
        const last = lastByGroup.get(g.id) ?? null;
        return {
          groupId: g.id, title: g.name, isDirect: false, avatarId: g.id,
          lastMessage: last ? last.body : null, lastAt: last ? last.created_at : null,
          unread: unreadByGroup.get(g.id) ?? 0
        } as Conversation;
      })
      .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  },
  async listNotifications(meId) {
    const { data, error } = await sb().from('notifications')
      .select('*').eq('user_id', meId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []) as AppNotification[];
  },
  async markNotificationsRead(meId, kind = 'all') {
    let q = sb().from('notifications')
      .update({ read_at: new Date().toISOString() }).eq('user_id', meId).is('read_at', null);
    if (kind === 'general') q = q.neq('type', 'message');
    if (kind === 'message') q = q.eq('type', 'message');
    const { error } = await q;
    if (error) throw error;
  },
  async markChatRead(meId, groupId) {
    const { error } = await sb().from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', meId).eq('type', 'message').eq('group_id', groupId).is('read_at', null);
    if (error) throw error;
  }
} as Db;

export const db: Db = isConfigured ? supaDb : demoDb;
