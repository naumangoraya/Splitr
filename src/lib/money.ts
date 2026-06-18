// All money is handled as integer minor units (paisa for PKR = rupees * 100).
// Never use floating point arithmetic on money outside of parsing user input.

const ZERO_DECIMAL_CURRENCIES = new Set(['PKR', 'JPY', 'KRW', 'VND', 'IDR']);

export function decimalsFor(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

/** Parse a user-entered decimal string into integer minor units. Returns null if invalid. */
export function toCents(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '');
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  // Round to the nearest cent to avoid binary float drift, then to an integer.
  return Math.round(value * 100);
}

/** Format integer minor units for display in the given currency. */
export function fromCents(cents: number, currency = 'PKR'): string {
  const d = decimalsFor(currency);
  const major = cents / 100;
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d
    }).format(major);
  } catch {
    return `${major.toFixed(d)} ${currency}`;
  }
}

/** Plain number for display without the currency symbol (e.g. inside inputs). */
export function fromCentsPlain(cents: number, currency = 'PKR'): string {
  const d = decimalsFor(currency);
  return (cents / 100).toFixed(d);
}

/**
 * Split a total (in cents) equally across n participants, conserving every cent.
 * The first `remainder` participants receive one extra cent.
 */
export function splitEqual(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Split a total by integer/decimal weights (shares), conserving every cent.
 * Largest fractional remainders receive the leftover cents (largest-remainder method).
 */
export function splitByWeights(totalCents: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalCents * w) / totalWeight);
  const floors = raw.map((r) => Math.floor(r));
  let leftover = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < order.length && leftover > 0; k++) {
    result[order[k].i] += 1;
    leftover--;
  }
  return result;
}

/** Convert percentages (summing to 100) into conserving cent amounts. */
export function splitByPercent(totalCents: number, percents: number[]): number[] {
  // weights are the percentages themselves; largest-remainder handles rounding
  return splitByWeights(totalCents, percents);
}
