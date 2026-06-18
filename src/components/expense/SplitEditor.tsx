import { useEffect, useMemo, useState } from 'react';
import type { Member, SplitType } from '@/types';
import { splitEqual, splitByWeights, splitByPercent, toCents, fromCents, fromCentsPlain } from '@/lib/money';
import { Avatar } from '@/components/ui';

export interface SplitResult {
  splitType: SplitType;
  splits: { user_id: string; amount_owed_cents: number; shares: number | null; percentage: number | null }[];
  valid: boolean;
  message: string | null;
}

const MODES: { key: SplitType; label: string }[] = [
  { key: 'EQUAL', label: 'Equally' },
  { key: 'EXACT', label: 'Exact' },
  { key: 'PERCENT', label: 'Percent' },
  { key: 'SHARES', label: 'Shares' }
];

export function SplitEditor({
  participants,
  totalCents,
  currency,
  onChange
}: {
  participants: Member[];
  totalCents: number;
  currency: string;
  onChange: (r: SplitResult) => void;
}) {
  const [mode, setMode] = useState<SplitType>('EQUAL');
  const [exact, setExact] = useState<Record<string, string>>({});
  const [percent, setPercent] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>({});

  const ids = useMemo(() => participants.map((p) => p.id), [participants]);

  // initialise defaults when participant set changes
  useEffect(() => {
    setShares((prev) => Object.fromEntries(ids.map((id) => [id, prev[id] ?? '1'])));
    setPercent((prev) => Object.fromEntries(ids.map((id) => [id, prev[id] ?? ''])));
    setExact((prev) => Object.fromEntries(ids.map((id) => [id, prev[id] ?? ''])));
  }, [ids]);

  const result = useMemo<SplitResult>(() => {
    if (ids.length === 0) return { splitType: mode, splits: [], valid: false, message: 'Add at least one participant' };
    if (totalCents <= 0) return { splitType: mode, splits: [], valid: false, message: 'Enter an amount first' };

    if (mode === 'EQUAL') {
      const parts = splitEqual(totalCents, ids.length);
      return {
        splitType: mode,
        splits: ids.map((id, i) => ({ user_id: id, amount_owed_cents: parts[i], shares: null, percentage: null })),
        valid: true,
        message: null
      };
    }

    if (mode === 'EXACT') {
      const cents = ids.map((id) => toCents(exact[id] ?? ''));
      if (cents.some((c) => c === null)) return { splitType: mode, splits: [], valid: false, message: 'Enter a valid amount for each person' };
      const sum = (cents as number[]).reduce((a, b) => a + b, 0);
      const diff = totalCents - sum;
      return {
        splitType: mode,
        splits: ids.map((id, i) => ({ user_id: id, amount_owed_cents: cents[i] as number, shares: null, percentage: null })),
        valid: diff === 0,
        message: diff === 0 ? null : diff > 0 ? `${fromCents(diff, currency)} left to assign` : `${fromCents(-diff, currency)} over the total`
      };
    }

    if (mode === 'PERCENT') {
      const nums = ids.map((id) => Number(percent[id] ?? ''));
      if (nums.some((n) => !Number.isFinite(n))) return { splitType: mode, splits: [], valid: false, message: 'Enter a percentage for each person' };
      const sum = nums.reduce((a, b) => a + b, 0);
      const parts = splitByPercent(totalCents, nums);
      return {
        splitType: mode,
        splits: ids.map((id, i) => ({ user_id: id, amount_owed_cents: parts[i], shares: null, percentage: nums[i] })),
        valid: Math.abs(sum - 100) < 0.001,
        message: Math.abs(sum - 100) < 0.001 ? null : `Percentages add up to ${sum.toFixed(1)}% — must be 100%`
      };
    }

    // SHARES
    const nums = ids.map((id) => Number(shares[id] ?? '0'));
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) return { splitType: mode, splits: [], valid: false, message: 'Enter shares for each person' };
    const totalShares = nums.reduce((a, b) => a + b, 0);
    if (totalShares <= 0) return { splitType: mode, splits: [], valid: false, message: 'Total shares must be greater than 0' };
    const parts = splitByWeights(totalCents, nums);
    return {
      splitType: mode,
      splits: ids.map((id, i) => ({ user_id: id, amount_owed_cents: parts[i], shares: nums[i], percentage: null })),
      valid: true,
      message: null
    };
  }, [mode, ids, totalCents, exact, percent, shares, currency]);

  useEffect(() => onChange(result), [result, onChange]);

  return (
    <div>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-line/60 p-1">
        {MODES.map((m) => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`tap h-9 rounded-lg text-[13px] font-semibold ${mode === m.key ? 'bg-card text-ink shadow-sm' : 'text-ink-muted'}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {participants.map((p) => {
          const split = result.splits.find((s) => s.user_id === p.id);
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 shadow-card">
              <Avatar id={p.id} name={p.full_name} size={32} />
              <span className="flex-1 truncate text-[14px] font-medium text-ink">{p.full_name}</span>

              {mode === 'EQUAL' && (
                <span className="tabular text-[14px] font-semibold text-ink-soft">
                  {split ? fromCents(split.amount_owed_cents, currency) : '—'}
                </span>
              )}
              {mode === 'EXACT' && (
                <input inputMode="decimal" value={exact[p.id] ?? ''} placeholder="0"
                  onChange={(e) => setExact({ ...exact, [p.id]: e.target.value })}
                  className="tabular h-9 w-24 rounded-lg border border-line px-2 text-right text-[14px] outline-none focus:border-brand" />
              )}
              {mode === 'PERCENT' && (
                <div className="flex items-center gap-1">
                  <input inputMode="decimal" value={percent[p.id] ?? ''} placeholder="0"
                    onChange={(e) => setPercent({ ...percent, [p.id]: e.target.value })}
                    className="tabular h-9 w-16 rounded-lg border border-line px-2 text-right text-[14px] outline-none focus:border-brand" />
                  <span className="text-[13px] text-ink-muted">%</span>
                  <span className="tabular ml-1 w-20 text-right text-[12.5px] text-ink-muted">{split ? fromCentsPlain(split.amount_owed_cents, currency) : ''}</span>
                </div>
              )}
              {mode === 'SHARES' && (
                <div className="flex items-center gap-2">
                  <input inputMode="numeric" value={shares[p.id] ?? ''} placeholder="0"
                    onChange={(e) => setShares({ ...shares, [p.id]: e.target.value })}
                    className="tabular h-9 w-14 rounded-lg border border-line px-2 text-right text-[14px] outline-none focus:border-brand" />
                  <span className="tabular w-20 text-right text-[12.5px] text-ink-muted">{split ? fromCents(split.amount_owed_cents, currency) : ''}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {result.message && (
        <p className={`mt-2 text-[13px] ${result.valid ? 'text-ink-muted' : 'text-owe'}`}>{result.message}</p>
      )}
    </div>
  );
}
