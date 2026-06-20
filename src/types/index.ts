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
