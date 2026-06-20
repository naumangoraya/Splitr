import type { Expense, Settlement, Member, Payment } from '@/types';
import type { MemberBalance, PairwiseDebt } from '@/lib/debt';

/** Payments for an expense, falling back to the single primary payer if the
 *  payments list is empty (older rows / single-payer expenses). */
function paymentsOf(e: Expense): Payment[] {
  if (e.payments && e.payments.length > 0) return e.payments;
  return [{ user_id: e.paid_by, amount_cents: e.amount_cents }];
}

/**
 * Per-expense net per person (paid − owed), in integer cents, counting only
 * ACTIVE splits. When a person's split is settled/disputed it's removed from
 * the owed side AND the payers' credit is reduced by the same total (attributed
 * to payers in proportion to how much each paid), so the books always conserve.
 */
export function expenseNet(e: Expense): Map<string, number> {
  const net = new Map<string, number>();
  if (e.settled_at || e.disputed_at) return net; // whole expense inactive

  let activeOwed = 0;
  for (const s of e.splits) {
    if (s.settled_at || s.disputed_at) continue;
    net.set(s.user_id, (net.get(s.user_id) ?? 0) - s.amount_owed_cents);
    activeOwed += s.amount_owed_cents;
  }

  const payments = paymentsOf(e);
  const totalPaid = payments.reduce((a, p) => a + p.amount_cents, 0) || 1;
  // credit payers only up to the still-owed amount, distributed by their share
  // of the total payment; last payer absorbs the rounding remainder.
  let credited = 0;
  payments.forEach((p, i) => {
    const credit = i === payments.length - 1
      ? activeOwed - credited
      : Math.round((p.amount_cents / totalPaid) * activeOwed);
    credited += credit;
    net.set(p.user_id, (net.get(p.user_id) ?? 0) + credit);
  });
  return net;
}

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
    for (const [userId, v] of expenseNet(e)) {
      net.set(userId, (net.get(userId) ?? 0) + v);
    }
  }

  for (const s of settlements) {
    if (s.status !== 'confirmed') continue; // only confirmed settlements affect balances (pending/disputed excluded)
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
    // Per-expense net (active splits only). Then match net-debtors to
    // net-creditors (greedy), which handles single OR multiple payers correctly.
    const net = expenseNet(e);
    const creditors = [...net.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
    const debtors = [...net.entries()].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
    let ci = 0;
    for (const d of debtors) {
      let remaining = d.v;
      while (remaining > 0 && ci < creditors.length) {
        const c = creditors[ci];
        const amt = Math.min(remaining, c.v);
        if (amt > 0) edges.push({ fromUser: d.id, toUser: c.id, amountCents: amt });
        remaining -= amt;
        c.v -= amt;
        if (c.v === 0) ci++;
      }
    }
  }
  for (const s of settlements) {
    if (s.status !== 'confirmed') continue; // only confirmed settlements affect balances
    // a payment reduces what from_user owes to_user => opposing edge
    edges.push({ fromUser: s.to_user, toUser: s.from_user, amountCents: s.amount_cents });
  }
  return edges;
}

/**
 * My pairwise net with a specific other person, in integer cents, from a set
 * of directed edges (as produced by pairwiseEdges). Positive = they owe me;
 * negative = I owe them. Only edges strictly between the two people count.
 */
export function pairwiseNetBetween(
  edges: PairwiseDebt[],
  meId: string,
  otherId: string
): number {
  let net = 0;
  for (const e of edges) {
    if (e.fromUser === otherId && e.toUser === meId) net += e.amountCents; // they owe me
    else if (e.fromUser === meId && e.toUser === otherId) net -= e.amountCents; // I owe them
  }
  return net;
}
