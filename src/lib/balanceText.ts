// Plain-language balance wording, used everywhere a net balance is shown.
// Replaces the confusing "owed / owes / you owe" terms with action-oriented copy.
//   net > 0  → money is coming TO you   → "You'll get"  (green / text-owed)
//   net < 0  → money you need to PAY    → "You'll pay"  (red   / text-owe)
//   net = 0  → nothing outstanding      → "Settled"

export type BalanceTone = 'get' | 'pay' | 'settled';

export function balanceTone(netCents: number): BalanceTone {
  return netCents > 0 ? 'get' : netCents < 0 ? 'pay' : 'settled';
}

/** Short status for list rows / summary cards: "You'll get" | "You'll pay" | "Settled". */
export function netLabel(netCents: number): string {
  return netCents > 0 ? "You'll get" : netCents < 0 ? "You'll pay" : 'Settled';
}

/** Per-person phrasing: "Ali pays you" | "You'll pay Ali" | "Settled with Ali". */
export function personNetLabel(netCents: number, name: string): string {
  if (netCents > 0) return `${name} pays you`;
  if (netCents < 0) return `You'll pay ${name}`;
  return `Settled with ${name}`;
}
