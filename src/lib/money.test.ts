import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, splitEqual, splitByWeights, splitByPercent } from './money.ts';
import { simplifyDebts, nettedPairwise } from './debt.ts';
import { pairwiseNetBetween, computeBalances } from './balances.ts';
import type { Expense, Member } from '../types/index.ts';

const mem = (id: string): Member => ({ id, full_name: id, email: '', avatar_url: null, preferred_currency: 'PKR', role: 'member' });
// splits: [userId, owed] or [userId, owed, 'settled'|'disputed']
function expense(payments: [string, number][], splits: [string, number, ('settled'|'disputed')?][]): Expense {
  const amount = payments.reduce((a, [, c]) => a + c, 0);
  return {
    id: 'e', group_id: 'g', paid_by: payments[0][0], created_by: payments[0][0],
    amount_cents: amount, currency: 'PKR', description: 'dinner', category: 'food',
    split_type: 'EQUAL', expense_date: '2026-01-01', receipt_url: null,
    settled_at: null, disputed_at: null, created_at: '2026-01-01T00:00:00Z',
    splits: splits.map(([user_id, c, state]) => ({
      user_id, amount_owed_cents: c, shares: null, percentage: null,
      settled_at: state === 'settled' ? 'x' : null,
      disputed_at: state === 'disputed' ? 'x' : null
    })),
    payments: payments.map(([user_id, c]) => ({ user_id, amount_cents: c }))
  };
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test('toCents parses and rejects correctly', () => {
  assert.equal(toCents('100'), 10000);
  assert.equal(toCents('100.50'), 10050);
  assert.equal(toCents('0.01'), 1);
  assert.equal(toCents('1,250'), 125000);
  assert.equal(toCents('abc'), null);
  assert.equal(toCents('-5'), null);
  assert.equal(toCents(''), null);
});

test('equal split conserves the total (odd division)', () => {
  const parts = splitEqual(10000, 3); // 100.00 / 3
  assert.deepEqual(parts, [3334, 3333, 3333]);
  assert.equal(sum(parts), 10000);
});

test('equal split conserves for many awkward amounts', () => {
  for (const total of [1, 7, 99, 10000, 12345, 100001]) {
    for (const n of [1, 2, 3, 4, 5, 7, 11]) {
      assert.equal(sum(splitEqual(total, n)), total, `total=${total} n=${n}`);
    }
  }
});

test('shares split conserves the total', () => {
  const parts = splitByWeights(10000, [2, 1, 1]); // 50 / 25 / 25
  assert.equal(sum(parts), 10000);
  assert.equal(parts[0], 5000);
});

test('percent split conserves and handles rounding', () => {
  const parts = splitByPercent(10000, [33.33, 33.33, 33.34]);
  assert.equal(sum(parts), 10000);
});

test('debt simplification reduces a 3-way cycle', () => {
  // A paid 300 for a 3-way equal dinner -> B and C each owe A 100.
  const balances = [
    { userId: 'A', name: 'A', netCents: 20000 },
    { userId: 'B', name: 'B', netCents: -10000 },
    { userId: 'C', name: 'C', netCents: -10000 }
  ];
  const transfers = simplifyDebts(balances);
  assert.equal(transfers.length, 2);
  assert.equal(sum(transfers.map((t) => t.amountCents)), 20000);
  // every transfer goes to A
  assert.ok(transfers.every((t) => t.toUser === 'A'));
});

test('debt simplification collapses a chain A->B->C', () => {
  // A owes B 50, B owes C 50  ==> net: A -50, C +50, B 0
  const balances = [
    { userId: 'A', name: 'A', netCents: -5000 },
    { userId: 'B', name: 'B', netCents: 0 },
    { userId: 'C', name: 'C', netCents: 5000 }
  ];
  const transfers = simplifyDebts(balances);
  assert.equal(transfers.length, 1);
  assert.deepEqual(
    { from: transfers[0].fromUser, to: transfers[0].toUser, amt: transfers[0].amountCents },
    { from: 'A', to: 'C', amt: 5000 }
  );
});

test('pairwiseNetBetween nets edges in both directions', () => {
  const edges = [
    { fromUser: 'B', toUser: 'A', amountCents: 5000 }, // B owes A
    { fromUser: 'A', toUser: 'B', amountCents: 2000 }, // A owes B
    { fromUser: 'C', toUser: 'A', amountCents: 9999 }  // unrelated to A<->B pair
  ];
  // From A's view with B: they owe me 5000, I owe them 2000 => +3000
  assert.equal(pairwiseNetBetween(edges, 'A', 'B'), 3000);
  // From B's view with A: mirror => -3000
  assert.equal(pairwiseNetBetween(edges, 'B', 'A'), -3000);
  // No edges between A and a stranger
  assert.equal(pairwiseNetBetween(edges, 'A', 'Z'), 0);
});

test('multiple payers — scenario 1 (1800/200 paid, 500 each)', () => {
  // A,B,C,D dinner 2000, equal 500 each. A paid 1800, B paid 200.
  const members = ['A', 'B', 'C', 'D'].map(mem);
  const e = expense([['A', 1800], ['B', 200]], [['A', 500], ['B', 500], ['C', 500], ['D', 500]]);
  const balances = computeBalances(members, [e], []);
  const net = Object.fromEntries(balances.map((b) => [b.userId, b.netCents]));
  assert.deepEqual(net, { A: 1300, B: -300, C: -500, D: -500 });
  assert.equal(net.A + net.B + net.C + net.D, 0);
  const transfers = simplifyDebts(balances);
  // everyone who owes ends up paying A (the only net creditor)
  assert.ok(transfers.every((t) => t.toUser === 'A'));
  assert.equal(sum(transfers.map((t) => t.amountCents)), 1300);
});

test('multiple payers — scenario 2 (1200/800 paid, 500 each)', () => {
  // A paid 1200, B paid 800; equal 500 each.
  const members = ['A', 'B', 'C', 'D'].map(mem);
  const e = expense([['A', 1200], ['B', 800]], [['A', 500], ['B', 500], ['C', 500], ['D', 500]]);
  const balances = computeBalances(members, [e], []);
  const net = Object.fromEntries(balances.map((b) => [b.userId, b.netCents]));
  assert.deepEqual(net, { A: 700, B: 300, C: -500, D: -500 });
  const transfers = simplifyDebts(balances);
  // C and D (debtors 500 each) settle the 700+300 owed to A and B
  assert.equal(sum(transfers.map((t) => t.amountCents)), 1000);
  assert.ok(transfers.every((t) => t.toUser === 'A' || t.toUser === 'B'));
  assert.ok(transfers.every((t) => t.fromUser === 'C' || t.fromUser === 'D'));
});

test('per-split settle clears only that person (your dinner scenario)', () => {
  // You paid 6000, split 2000 each (You/Nauman/Ali). Nauman settles his share.
  const members = ['You', 'Nauman', 'Ali'].map(mem);
  const e = expense([['You', 6000]], [['You', 2000], ['Nauman', 2000, 'settled'], ['Ali', 2000]]);
  const balances = computeBalances(members, [e], []);
  const net = Object.fromEntries(balances.map((b) => [b.userId, b.netCents]));
  // You now owed only 2000 (from Ali); Nauman cleared; Ali still owes 2000.
  assert.deepEqual(net, { You: 2000, Nauman: 0, Ali: -2000 });
  assert.equal(net.You + net.Nauman + net.Ali, 0);
});

test('per-split: all shares settled => everyone zero', () => {
  const members = ['You', 'Nauman', 'Ali'].map(mem);
  const e = expense([['You', 6000]], [['You', 2000], ['Nauman', 2000, 'settled'], ['Ali', 2000, 'settled']]);
  const net = Object.fromEntries(computeBalances(members, [e], []).map((b) => [b.userId, b.netCents]));
  assert.deepEqual(net, { You: 0, Nauman: 0, Ali: 0 });
});

test('partial payer who also owes: net counts correctly', () => {
  // 4-way dinner 4000 (1000 each). A paid 2500, B paid 1500. A & B are payers AND owe.
  const members = ['A', 'B', 'C', 'D'].map(mem);
  const e = expense([['A', 2500], ['B', 1500]], [['A', 1000], ['B', 1000], ['C', 1000], ['D', 1000]]);
  const net = Object.fromEntries(computeBalances(members, [e], []).map((b) => [b.userId, b.netCents]));
  // A: paid 2500 - owes 1000 = +1500 ; B: 1500 - 1000 = +500 ; C,D: -1000 each
  assert.deepEqual(net, { A: 1500, B: 500, C: -1000, D: -1000 });
  assert.equal(net.A + net.B + net.C + net.D, 0);
});

test('partial payer + one debtor settles', () => {
  const members = ['A', 'B', 'C', 'D'].map(mem);
  const e = expense([['A', 2500], ['B', 1500]], [['A', 1000], ['B', 1000], ['C', 1000, 'settled'], ['D', 1000]]);
  const net = Object.fromEntries(computeBalances(members, [e], []).map((b) => [b.userId, b.netCents]));
  // C's 1000 cleared; payer credit drops by 1000 proportionally (A 2500/4000, B 1500/4000)
  assert.equal(net.C, 0);
  assert.equal(net.A + net.B + net.C + net.D, 0); // still conserves
  assert.equal(net.D, -1000); // D still owes
});

test('nettedPairwise cancels opposing edges', () => {
  const edges = [
    { fromUser: 'A', toUser: 'B', amountCents: 5000 },
    { fromUser: 'B', toUser: 'A', amountCents: 2000 }
  ];
  const out = nettedPairwise(edges);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { fromUser: 'A', toUser: 'B', amountCents: 3000 });
});
