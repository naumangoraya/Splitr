import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, splitEqual, splitByWeights, splitByPercent } from './money.ts';
import { simplifyDebts, nettedPairwise } from './debt.ts';

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

test('nettedPairwise cancels opposing edges', () => {
  const edges = [
    { fromUser: 'A', toUser: 'B', amountCents: 5000 },
    { fromUser: 'B', toUser: 'A', amountCents: 2000 }
  ];
  const out = nettedPairwise(edges);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { fromUser: 'A', toUser: 'B', amountCents: 3000 });
});
