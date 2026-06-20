import type { Profile, Group, Expense, Settlement, Comment, Activity } from '@/types';

export const DEMO_ME_ID = 'u-ayesha';

export const demoProfiles: Profile[] = [
  { id: 'u-ayesha', full_name: 'Ayesha', email: 'ayesha@demo.pk', avatar_url: null, preferred_currency: 'PKR' },
  { id: 'u-bilal', full_name: 'Bilal', email: 'bilal@demo.pk', avatar_url: null, preferred_currency: 'PKR' },
  { id: 'u-hira', full_name: 'Hira', email: 'hira@demo.pk', avatar_url: null, preferred_currency: 'PKR' },
  { id: 'u-usman', full_name: 'Usman', email: 'usman@demo.pk', avatar_url: null, preferred_currency: 'PKR' }
];

export const demoGroups: Group[] = [
  {
    id: 'g-flat',
    name: 'Apartment 4B',
    description: 'Rent, bills and groceries',
    default_currency: 'PKR',
    simplify_debts: true,
    is_direct: false,
    created_by: 'u-ayesha',
    created_at: '2026-05-01T10:00:00Z'
  },
  {
    id: 'g-trip',
    name: 'Northern Trip',
    description: 'Hunza & Skardu',
    default_currency: 'PKR',
    simplify_debts: true,
    is_direct: false,
    created_by: 'u-bilal',
    created_at: '2026-06-02T08:00:00Z'
  },
  {
    id: 'g-direct-bilal',
    name: 'Bilal',
    description: null,
    default_currency: 'PKR',
    simplify_debts: false,
    is_direct: true,
    created_by: 'u-ayesha',
    created_at: '2026-05-20T08:00:00Z'
  }
];

export const demoMembers: Record<string, string[]> = {
  'g-flat': ['u-ayesha', 'u-bilal', 'u-hira'],
  'g-trip': ['u-ayesha', 'u-bilal', 'u-hira', 'u-usman'],
  'g-direct-bilal': ['u-ayesha', 'u-bilal']
};

function eq(total: number, ids: string[]): Expense['splits'] {
  const base = Math.floor(total / ids.length);
  const rem = total - base * ids.length;
  return ids.map((id, i) => ({
    user_id: id,
    amount_owed_cents: base + (i < rem ? 1 : 0),
    shares: null,
    percentage: null,
    settled_at: null,
    disputed_at: null
  }));
}

export const demoExpenses: Expense[] = ([
  {
    id: 'e-1', group_id: 'g-flat', paid_by: 'u-ayesha', created_by: 'u-ayesha',
    amount_cents: 4500000, currency: 'PKR', description: 'June rent', category: 'rent',
    split_type: 'EQUAL', expense_date: '2026-06-01', receipt_url: null,
    created_at: '2026-06-01T09:00:00Z', splits: eq(4500000, ['u-ayesha', 'u-bilal', 'u-hira'])
  },
  {
    id: 'e-2', group_id: 'g-flat', paid_by: 'u-bilal', created_by: 'u-bilal',
    amount_cents: 1280000, currency: 'PKR', description: 'Electricity bill', category: 'utilities',
    split_type: 'EQUAL', expense_date: '2026-06-05', receipt_url: null,
    created_at: '2026-06-05T18:30:00Z', splits: eq(1280000, ['u-ayesha', 'u-bilal', 'u-hira'])
  },
  {
    id: 'e-3', group_id: 'g-flat', paid_by: 'u-hira', created_by: 'u-hira',
    amount_cents: 860000, currency: 'PKR', description: 'Groceries', category: 'groceries',
    split_type: 'SHARES', expense_date: '2026-06-09', receipt_url: null,
    created_at: '2026-06-09T20:00:00Z',
    splits: [
      { user_id: 'u-ayesha', amount_owed_cents: 286667, shares: 1, percentage: null },
      { user_id: 'u-bilal', amount_owed_cents: 286667, shares: 1, percentage: null },
      { user_id: 'u-hira', amount_owed_cents: 286666, shares: 1, percentage: null }
    ]
  },
  {
    id: 'e-4', group_id: 'g-trip', paid_by: 'u-bilal', created_by: 'u-bilal',
    amount_cents: 6000000, currency: 'PKR', description: 'Hotel in Hunza', category: 'travel',
    split_type: 'EQUAL', expense_date: '2026-06-10', receipt_url: null,
    created_at: '2026-06-10T12:00:00Z', splits: eq(6000000, ['u-ayesha', 'u-bilal', 'u-hira', 'u-usman'])
  },
  {
    id: 'e-5', group_id: 'g-trip', paid_by: 'u-ayesha', created_by: 'u-ayesha',
    amount_cents: 2400000, currency: 'PKR', description: 'Fuel', category: 'transport',
    split_type: 'EQUAL', expense_date: '2026-06-11', receipt_url: null,
    created_at: '2026-06-11T07:30:00Z', splits: eq(2400000, ['u-ayesha', 'u-bilal', 'u-hira', 'u-usman'])
  },
  {
    id: 'e-6', group_id: 'g-direct-bilal', paid_by: 'u-ayesha', created_by: 'u-ayesha',
    amount_cents: 350000, currency: 'PKR', description: 'Concert tickets', category: 'entertainment',
    split_type: 'EQUAL', expense_date: '2026-05-21', receipt_url: null,
    created_at: '2026-05-21T15:00:00Z', splits: eq(350000, ['u-ayesha', 'u-bilal'])
  }
] as Omit<Expense, 'settled_at' | 'disputed_at' | 'payments'>[]).map((e) => ({
  ...e, settled_at: null, disputed_at: null,
  payments: [{ user_id: e.paid_by, amount_cents: e.amount_cents }]
}));

export const demoSettlements: Settlement[] = [
  {
    id: 's-1', group_id: 'g-flat', from_user: 'u-hira', to_user: 'u-ayesha',
    amount_cents: 500000, currency: 'PKR', note: 'partial', status: 'confirmed',
    created_at: '2026-06-12T10:00:00Z'
  }
];

export const demoComments: Comment[] = [
  { id: 'c-1', expense_id: 'e-1', user_id: 'u-bilal', body: 'Thanks for covering this!', created_at: '2026-06-01T10:00:00Z' }
];

const expenseActivity: Activity[] = demoExpenses.map((e) => ({
  id: `a-${e.id}`, group_id: e.group_id, actor_id: e.paid_by,
  type: 'expense_added', entity_id: e.id,
  metadata: { description: e.description, amount_cents: e.amount_cents },
  created_at: e.created_at
}));

const settlementActivity: Activity[] = demoSettlements.map((s) => ({
  id: `a-${s.id}`, group_id: s.group_id, actor_id: s.from_user,
  type: 'settlement', entity_id: s.id,
  metadata: { amount_cents: s.amount_cents, to_user: s.to_user },
  created_at: s.created_at
}));

export const demoActivity: Activity[] = [...expenseActivity, ...settlementActivity].sort((a, b) =>
  b.created_at.localeCompare(a.created_at)
);
