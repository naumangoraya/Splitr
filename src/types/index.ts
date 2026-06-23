export type SplitType = 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';
export type ActivityType =
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'settlement'
  | 'member_added'
  | 'comment';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  preferred_currency: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  default_currency: string;
  simplify_debts: boolean;
  is_direct: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Member extends Profile {
  role: 'owner' | 'member';
}

export interface Split {
  user_id: string;
  amount_owed_cents: number;
  shares: number | null;
  percentage: number | null;
  settled_at: string | null;   // this person's share has been settled
  disputed_at: string | null;  // this person disputes their share
}

export interface Payment {
  user_id: string;
  amount_cents: number; // what this person contributed toward the bill
}

export interface Expense {
  id: string;
  group_id: string;
  paid_by: string;
  created_by: string;
  amount_cents: number;
  currency: string;
  description: string;
  category: string;
  split_type: SplitType;
  expense_date: string;
  receipt_url: string | null;
  settled_at: string | null;
  disputed_at: string | null;
  created_at: string;
  splits: Split[];
  // who actually paid, and how much each contributed. For single-payer
  // expenses this is one row equal to amount_cents (paid_by is the primary).
  payments: Payment[];
}

export type SettlementStatus = 'pending' | 'confirmed' | 'disputed';

export interface Settlement {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount_cents: number;
  currency: string;
  note: string | null;
  status: SettlementStatus;
  created_by?: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  expense_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface Activity {
  id: string;
  group_id: string | null;
  actor_id: string | null;
  type: ActivityType;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// chat message; expense (optional) = a mentioned transaction, rendered as a card
export interface Message {
  id: string;
  group_id: string;
  user_id: string;
  body: string;
  expense_id: string | null;
  created_at: string;
}

// chat message enriched for display (sender name + optional mentioned expense)
export interface ChatMessage extends Message {
  senderName: string;
  // groupId = the mentioned expense's own group (may differ from the chat's
  // group when a friend chat references a shared-group transaction).
  mention?: { id: string; description: string; amountCents: number; currency: string; groupId: string } | null;
}

// An expense that can be mentioned/attached in a chat. In a friend (direct) chat
// this spans BOTH the personal balance between the two AND any group they share;
// in a group chat it's that group's transactions. groupLabel tells the user where
// each one comes from ("Personal" for the direct balance, else the group name).
export interface MentionableExpense {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  category: string;
  groupId: string;
  groupLabel: string;
  date: string; // created_at, for sorting
}

// a person you can have a 1-to-1 chat with (anyone you share any group with).
// directGroupId is the existing 1-1 group, or null if a chat hasn't started yet
// (tapping creates one on demand).
export interface ChatPerson {
  id: string;
  name: string;
  email: string;
  directGroupId: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
}

// one row in the Chats inbox — a direct (1-to-1) or group conversation
export interface Conversation {
  groupId: string;
  title: string;            // friend's name for direct, group name for group
  isDirect: boolean;
  avatarId: string;         // seed for the avatar colour (other person for direct, else group)
  lastMessage: string | null;
  lastAt: string | null;    // time of the last message (null = no messages yet)
  unread: number;           // unread message notifications for this conversation
}

export type NotificationType = 'expense_added' | 'settlement' | 'message';

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  group_id: string | null;
  expense_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
}

export const CATEGORIES = [
  'general',
  'food',
  'transport',
  'rent',
  'utilities',
  'entertainment',
  'travel',
  'groceries'
] as const;
export type Category = (typeof CATEGORIES)[number];
