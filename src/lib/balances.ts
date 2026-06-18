import type { Expense, Settlement, Member } from '@/types';
import type { MemberBalance, PairwiseDebt } from '@/lib/debt';

/**
 * Net balance per member, in integer cents.
 *   net = (paid in expenses) - (owed in splits) + (settlement received) - (settlement sent)
 * A positive net means the member is owed money; negative means they owe.
 */
export function computeBalances(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[]
): MemberBalance[] {
  const net = new Map<string, number>();
  for (const m of members) net.set(m.id, 0);

  for (const e of expenses) {
    net.set(e.paid_by, (net.get(e.paid_by) ?? 0) + e.amount_cents);
    for (const s of e.splits) {
      net.set(s.user_id, (net.get(s.user_id) ?? 0) - s.amount_owed_cents);
    }
  }

  for (const s of settlements) {
    net.set(s.from_user, (net.get(s.from_user) ?? 0) + s.amount_cents);
    net.set(s.to_user, (net.get(s.to_user) ?? 0) - s.amount_cents);
  }

  return members.map((m) => ({
    userId: m.id,
    name: m.full_name,
    netCents: net.get(m.id) ?? 0
  }));
}

/** Raw directed edges (debtor -> creditor) before netting, for the un-simplified view. */
export function pairwiseEdges(
  expenses: Expense[],
  settlements: Settlement[]
): PairwiseDebt[] {
  const edges: PairwiseDebt[] = [];
  for (const e of expenses) {
    for (const s of e.splits) {
      if (s.user_id === e.paid_by) continue;
      edges.push({ fromUser: s.user_id, toUser: e.paid_by, amountCents: s.amount_owed_cents });
    }
  }
  for (const s of settlements) {
    // a payment reduces what from_user owes to_user => opposing edge
    edges.push({ fromUser: s.to_user, toUser: s.from_user, amountCents: s.amount_cents });
  }
  return edges;
}

export function myNet(balances: MemberBalance[], userId: string): number {
  return balances.find((b) => b.userId === userId)?.netCents ?? 0;
}
