export interface MemberBalance {
  userId: string;
  name: string;
  netCents: number; // > 0 creditor (is owed), < 0 debtor (owes)
}

export interface Transfer {
  fromUser: string;
  fromName: string;
  toUser: string;
  toName: string;
  amountCents: number;
}

/**
 * Greedy minimum-cash-flow simplification. Operates entirely on integer cents,
 * so no floating-point epsilon comparisons are required. The sum of all net
 * balances in a settled group is always zero.
 */
export function simplifyDebts(balances: MemberBalance[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.netCents - b.netCents); // most negative first

  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.netCents - a.netCents); // largest creditor first

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = Math.min(-d.netCents, c.netCents);
    if (amt > 0) {
      transfers.push({
        fromUser: d.userId,
        fromName: d.name,
        toUser: c.userId,
        toName: c.name,
        amountCents: amt
      });
    }
    d.netCents += amt;
    c.netCents -= amt;
    if (d.netCents === 0) i++;
    if (c.netCents === 0) j++;
  }

  return transfers;
}

/** Raw pairwise edges (used when a group disables simplification). */
export interface PairwiseDebt {
  fromUser: string;
  toUser: string;
  amountCents: number;
}

/**
 * Net every directed (debtor -> creditor) pair so that at most one edge exists
 * between any two people, in a single canonical direction.
 */
export function nettedPairwise(edges: PairwiseDebt[]): PairwiseDebt[] {
  const map = new Map<string, number>(); // key "a|b" => net a owes b
  for (const e of edges) {
    if (e.amountCents === 0) continue;
    const [a, b, amt] =
      e.fromUser < e.toUser
        ? [e.fromUser, e.toUser, e.amountCents]
        : [e.toUser, e.fromUser, -e.amountCents];
    const key = `${a}|${b}`;
    map.set(key, (map.get(key) ?? 0) + amt);
  }
  const out: PairwiseDebt[] = [];
  for (const [key, net] of map) {
    if (net === 0) continue;
    const [a, b] = key.split('|');
    out.push(net > 0
      ? { fromUser: a, toUser: b, amountCents: net }
      : { fromUser: b, toUser: a, amountCents: -net });
  }
  return out;
}
