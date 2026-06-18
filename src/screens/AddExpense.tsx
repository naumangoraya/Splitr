import { useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner, ErrorState, Button, Input, Avatar } from '@/components/ui';
import { SplitEditor, type SplitResult } from '@/components/expense/SplitEditor';
import { toCents } from '@/lib/money';
import { CATEGORIES } from '@/types';
import { X, Check } from 'lucide-react';

export default function AddExpense() {
  const { user } = useAuth();
  const me = user!;
  const { groupId } = useParams();
  const nav = useNavigate();

  const { data: groups, loading, error, reload } = useAsync(() => db.listGroups(me.id), [me.id]);

  const [selectedGroup, setSelectedGroup] = useState<string | null>(groupId ?? null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [paidBy, setPaidBy] = useState(me.id);
  const [participants, setParticipants] = useState<string[] | null>(null);
  const [split, setSplit] = useState<SplitResult>({ splitType: 'EQUAL', splits: [], valid: false, message: null });
  const [busy, setBusy] = useState(false);

  const groupBundle = useAsync(
    async () => (selectedGroup ? db.getGroup(selectedGroup) : null),
    [selectedGroup]
  );

  const members = groupBundle.data?.members ?? [];
  const activeParticipants = participants ?? members.map((m) => m.id);
  const participantMembers = members.filter((m) => activeParticipants.includes(m.id));
  const totalCents = toCents(amount) ?? 0;

  const onSplitChange = useCallback((r: SplitResult) => setSplit(r), []);

  const canSave = useMemo(
    () => Boolean(selectedGroup) && totalCents > 0 && description.trim().length > 0 && split.valid && !busy,
    [selectedGroup, totalCents, description, split.valid, busy]
  );

  async function save() {
    if (!selectedGroup || !canSave) return;
    setBusy(true);
    try {
      await db.addExpense({
        group_id: selectedGroup,
        paid_by: paidBy,
        amount_cents: totalCents,
        currency: groupBundle.data?.group.default_currency ?? me.preferred_currency,
        description: description.trim(),
        category,
        split_type: split.splitType,
        expense_date: new Date().toISOString().slice(0, 10),
        splits: split.splits
      });
      nav(`/group/${selectedGroup}`);
    } catch (e) {
      setBusy(false);
      alert(e instanceof Error ? e.message : 'Could not save the expense');
    }
  }

  function toggleParticipant(id: string) {
    const base = participants ?? members.map((m) => m.id);
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    setParticipants(next);
  }

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur">
          <button className="tap rounded-lg p-1.5" onClick={() => nav(-1)}><X className="h-5 w-5 text-ink-soft" /></button>
          <h1 className="font-display text-[17px] font-bold text-ink">Add expense</h1>
          <button className="tap rounded-lg p-1.5 disabled:opacity-30" onClick={save} disabled={!canSave}>
            <Check className="h-5 w-5 text-brand" />
          </button>
        </header>
      }
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-5 px-5 py-4">
          {/* group picker */}
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Group</span>
            <div className="flex flex-wrap gap-2">
              {(groups ?? []).map(({ group }) => (
                <button key={group.id} onClick={() => { setSelectedGroup(group.id); setParticipants(null); }}
                  className={`tap rounded-xl px-3.5 py-2 text-[14px] font-semibold ${selectedGroup === group.id ? 'bg-brand text-white' : 'bg-brand-wash text-brand'}`}>
                  {group.name}
                </button>
              ))}
              {(groups ?? []).length === 0 && <p className="text-[13px] text-ink-muted">Create a group first.</p>}
            </div>
          </div>

          <Input label="Amount" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Description" placeholder="e.g. Dinner at Kolachi" value={description} onChange={(e) => setDescription(e.target.value)} />

          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Category</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`tap rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize ${category === c ? 'bg-ink text-white' : 'bg-card text-ink-soft shadow-card'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {selectedGroup && members.length > 0 && (
            <>
              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Paid by</span>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <button key={m.id} onClick={() => setPaidBy(m.id)}
                      className={`tap flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-3 ${paidBy === m.id ? 'bg-brand text-white' : 'bg-card text-ink-soft shadow-card'}`}>
                      <Avatar id={m.id} name={m.full_name} size={24} />
                      <span className="text-[13px] font-medium">{m.id === me.id ? 'You' : m.full_name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Split between</span>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const on = activeParticipants.includes(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleParticipant(m.id)}
                        className={`tap rounded-xl px-3 py-1.5 text-[13px] font-medium ${on ? 'bg-owed-wash text-owed' : 'bg-card text-ink-muted shadow-card'}`}>
                        {m.id === me.id ? 'You' : m.full_name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-[13px] font-medium text-ink-soft">How to split</span>
                <SplitEditor
                  participants={participantMembers}
                  totalCents={totalCents}
                  currency={groupBundle.data?.group.default_currency ?? me.preferred_currency}
                  onChange={onSplitChange}
                />
              </div>

              <Button full onClick={save} disabled={!canSave}>{busy ? 'Saving…' : 'Save expense'}</Button>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
