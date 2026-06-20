import { useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner, ErrorState, Button, Input, Avatar, Sheet } from '@/components/ui';
import { SplitEditor, type SplitResult } from '@/components/expense/SplitEditor';
import { toCents, fromCents } from '@/lib/money';
import { CATEGORIES, type Member } from '@/types';
import { X, Check, ChevronDown } from 'lucide-react';

export default function AddExpense() {
  const { user } = useAuth();
  const me = user!;
  const { groupId } = useParams();
  const nav = useNavigate();

  const { data: groups, loading, error, reload } = useAsync(() => db.listGroups(me.id), [me.id]);
  const friendsAsync = useAsync(() => db.listFriends(me.id), [me.id]);

  // 'no-group' = split directly with friends, no group selected
  const NO_GROUP = '__friends__';
  const [selectedGroup, setSelectedGroup] = useState<string | null>(groupId ?? null);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  // which picker the user is in, and their search text
  const [mode, setMode] = useState<'group' | 'friends'>(groupId ? 'group' : 'group');
  const [groupQuery, setGroupQuery] = useState('');
  const [friendQuery, setFriendQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');     // search within "Split between" sheet
  const [paidByOpen, setPaidByOpen] = useState(false);    // "Paid by" picker sheet
  const [splitOpen, setSplitOpen] = useState(false);      // "Split between" picker sheet
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [paidBy, setPaidBy] = useState(me.id);
  const [multiPayer, setMultiPayer] = useState(false);          // multiple people paid
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({}); // payerId -> amount text
  const [participants, setParticipants] = useState<string[] | null>(null);
  const [split, setSplit] = useState<SplitResult>({ splitType: 'EQUAL', splits: [], valid: false, message: null });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isNoGroup = selectedGroup === NO_GROUP;

  const groupBundle = useAsync(
    async () => (selectedGroup && !isNoGroup ? db.getGroup(selectedGroup) : null),
    [selectedGroup]
  );

  const friends = friendsAsync.data ?? [];
  // In no-group mode, participants are me + selected friends, modeled as Members.
  const noGroupMembers: Member[] = isNoGroup
    ? [
        { ...me, role: 'owner' as const },
        ...friends.filter((f) => friendIds.includes(f.id)).map((f) => ({ ...f, role: 'member' as const }))
      ]
    : [];
  const members = isNoGroup ? noGroupMembers : (groupBundle.data?.members ?? []);
  const activeParticipants = participants ?? members.map((m) => m.id);
  const participantMembers = members.filter((m) => activeParticipants.includes(m.id));
  const totalCents = toCents(amount) ?? 0;
  const groupCurrency = groupBundle.data?.group.default_currency ?? me.preferred_currency;

  const onSplitChange = useCallback((r: SplitResult) => setSplit(r), []);

  // Multi-payer: parse the per-payer amounts; valid only if they sum to the total.
  const multiPayments = useMemo(
    () => members
      .map((m) => ({ user_id: m.id, amount_cents: toCents(payAmounts[m.id] ?? '') ?? 0 }))
      .filter((p) => p.amount_cents > 0),
    [members, payAmounts]
  );
  const paidSum = multiPayments.reduce((a, p) => a + p.amount_cents, 0);
  const multiPayerValid = !multiPayer || (totalCents > 0 && paidSum === totalCents);

  const canSave = useMemo(
    () => Boolean(selectedGroup) && (!isNoGroup || friendIds.length > 0)
      && totalCents > 0 && description.trim().length > 0 && split.valid && multiPayerValid && !busy,
    [selectedGroup, isNoGroup, friendIds.length, totalCents, description, split.valid, multiPayerValid, busy]
  );

  async function save() {
    if (!selectedGroup || !canSave) return;
    setBusy(true);
    setSaveError(null);
    try {
      if (isNoGroup) {
        // Split with friends, no group. I'm the payer; each friend's share
        // becomes a debt to me in our direct group. My own share isn't a debt.
        const shares = split.splits
          .filter((s) => s.user_id !== me.id)
          .map((s) => {
            const f = friends.find((x) => x.id === s.user_id)!;
            return { friend_id: f.id, friend_email: f.email, amount_owed_cents: s.amount_owed_cents };
          });
        await db.addPersonalSplit(me.id, {
          currency: me.preferred_currency,
          description: description.trim(),
          category,
          split_type: split.splitType,
          expense_date: new Date().toISOString().slice(0, 10),
          shares
        });
        nav('/friends');
        return;
      }
      // primary payer = the single payer, or the largest contributor when multiple
      const primaryPayer = multiPayer && multiPayments.length > 0
        ? [...multiPayments].sort((a, b) => b.amount_cents - a.amount_cents)[0].user_id
        : paidBy;
      await db.addExpense({
        group_id: selectedGroup,
        paid_by: primaryPayer,
        amount_cents: totalCents,
        currency: groupCurrency,
        description: description.trim(),
        category,
        split_type: split.splitType,
        expense_date: new Date().toISOString().slice(0, 10),
        splits: split.splits,
        payments: multiPayer ? multiPayments : undefined
      });
      nav(`/group/${selectedGroup}`);
    } catch (e) {
      setBusy(false);
      setSaveError(e instanceof Error ? e.message : 'Could not save the expense');
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
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <button className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl -ml-1" onClick={() => nav(-1)} aria-label="Close"><X className="h-6 w-6 text-ink-soft" /></button>
          <h1 className="font-display text-[17px] font-bold text-ink">Add expense</h1>
          <button className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl -mr-1 disabled:opacity-30" onClick={save} disabled={!canSave} aria-label="Save expense">
            <Check className="h-6 w-6 text-brand" />
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
          {/* Group | Friends toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
            <button
              onClick={() => { setMode('group'); if (selectedGroup === NO_GROUP) setSelectedGroup(null); setParticipants(null); }}
              className={`tap h-9 rounded-lg text-[14px] font-semibold ${mode === 'group' ? 'bg-card text-ink shadow-sm' : 'text-ink-muted'}`}>
              Group
            </button>
            <button
              onClick={() => { setMode('friends'); setSelectedGroup(NO_GROUP); setParticipants(null); }}
              className={`tap h-9 rounded-lg text-[14px] font-semibold ${mode === 'friends' ? 'bg-card text-ink shadow-sm' : 'text-ink-muted'}`}>
              Friends
            </button>
          </div>

          {/* GROUP picker: search → results */}
          {mode === 'group' && (
            <div>
              {selectedGroup && !isNoGroup ? (
                <div className="flex items-center gap-3 rounded-xl bg-brand-wash px-4 py-3">
                  <Avatar id={selectedGroup} name={groupBundle.data?.group.name ?? 'Group'} size={32} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-brand">{groupBundle.data?.group.name ?? 'Selected group'}</span>
                  <button className="tap text-[13px] font-medium text-brand" onClick={() => { setSelectedGroup(null); setParticipants(null); }}>Change</button>
                </div>
              ) : (
                <>
                  <Input placeholder="Search your groups…" value={groupQuery} onChange={(e) => setGroupQuery(e.target.value)} />
                  <div className="mt-2 overflow-hidden rounded-xl bg-card shadow-card">
                    {(groups ?? [])
                      .filter(({ group }) => group.name.toLowerCase().includes(groupQuery.trim().toLowerCase()))
                      .map(({ group }, i) => (
                        <button key={group.id} onClick={() => { setSelectedGroup(group.id); setParticipants(null); setGroupQuery(''); }}
                          className={`tap flex w-full items-center gap-3 px-4 py-3 text-left ${i > 0 ? 'border-t border-line' : ''}`}>
                          <Avatar id={group.id} name={group.name} size={30} />
                          <span className="min-w-0 flex-1 truncate font-medium text-ink">{group.name}</span>
                        </button>
                      ))}
                    {(groups ?? []).filter(({ group }) => group.name.toLowerCase().includes(groupQuery.trim().toLowerCase())).length === 0 && (
                      <p className="px-4 py-3 text-[13px] text-ink-muted">No matching group. Create one from the Groups tab.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* FRIENDS picker: search → multi-select */}
          {mode === 'friends' && (
            <div>
              <Input placeholder="Search friends…" value={friendQuery} onChange={(e) => setFriendQuery(e.target.value)} />
              {/* selected friends as removable chips */}
              {friendIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {friends.filter((f) => friendIds.includes(f.id)).map((f) => (
                    <button key={f.id}
                      onClick={() => { setFriendIds((cur) => cur.filter((x) => x !== f.id)); setParticipants(null); }}
                      className="tap flex items-center gap-2 rounded-xl bg-owed-wash py-1.5 pl-1.5 pr-2.5 text-owed">
                      <Avatar id={f.id} name={f.full_name || f.email} size={22} />
                      <span className="text-[13px] font-medium">{f.full_name || f.email}</span>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 overflow-hidden rounded-xl bg-card shadow-card">
                {friends.length === 0 ? (
                  <p className="px-4 py-3 text-[13px] text-ink-muted">Add a friend first (Friends tab) to split without a group.</p>
                ) : (
                  friends
                    .filter((f) => (f.full_name || f.email).toLowerCase().includes(friendQuery.trim().toLowerCase()))
                    .map((f, i) => {
                      const on = friendIds.includes(f.id);
                      return (
                        <button key={f.id}
                          onClick={() => { setFriendIds((cur) => on ? cur.filter((x) => x !== f.id) : [...cur, f.id]); setParticipants(null); }}
                          className={`tap flex w-full items-center gap-3 px-4 py-3 text-left ${i > 0 ? 'border-t border-line' : ''}`}>
                          <Avatar id={f.id} name={f.full_name || f.email} size={30} />
                          <span className="min-w-0 flex-1 truncate font-medium text-ink">{f.full_name || f.email}</span>
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${on ? 'border-owed bg-owed text-white' : 'border-line'}`}>
                            {on && <Check className="h-3.5 w-3.5" />}
                          </span>
                        </button>
                      );
                    })
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-ink-muted">You paid; each friend’s share is recorded in your direct balance with them.</p>
            </div>
          )}

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
              {!isNoGroup && (
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Paid by</span>
                  {/* compact summary row → opens a popup picker */}
                  <button onClick={() => setPaidByOpen(true)}
                    className="tap flex w-full items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 text-left shadow-card">
                    {!multiPayer && <Avatar id={paidBy} name={members.find((m) => m.id === paidBy)?.full_name ?? ''} size={28} />}
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                      {multiPayer
                        ? `${multiPayments.length || 0} people paid`
                        : (paidBy === me.id ? 'You' : members.find((m) => m.id === paidBy)?.full_name)}
                    </span>
                    <ChevronDown className="h-5 w-5 text-ink-muted" />
                  </button>
                </div>
              )}

              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Split between</span>
                {/* compact summary row → opens a popup multi-select */}
                <button onClick={() => setSplitOpen(true)}
                  className="tap flex w-full items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 text-left shadow-card">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                    {activeParticipants.length === members.length
                      ? `Everyone (${members.length})`
                      : activeParticipants.length === 0
                        ? 'No one selected'
                        : `${activeParticipants.length} of ${members.length} people`}
                  </span>
                  <ChevronDown className="h-5 w-5 text-ink-muted" />
                </button>
                {/* Payer-excluded summary: they get the full amount back */}
                {totalCents > 0 && !activeParticipants.includes(paidBy) && activeParticipants.length > 0 && (
                  <p className="mt-2 text-[12.5px] font-medium text-owed">
                    {paidBy === me.id ? 'You' : members.find((m) => m.id === paidBy)?.full_name} paid and isn’t splitting — gets back the full {fromCents(totalCents, groupCurrency)}.
                  </p>
                )}
              </div>

              <div>
                <span className="mb-2 block text-[13px] font-medium text-ink-soft">How to split</span>
                <SplitEditor
                  participants={participantMembers}
                  totalCents={totalCents}
                  currency={groupCurrency}
                  onChange={onSplitChange}
                />
              </div>

              {saveError && <p className="text-[13px] text-owe">{saveError}</p>}
              <Button full onClick={save} disabled={!canSave}>{busy ? 'Saving…' : 'Save expense'}</Button>
            </>
          )}
        </div>
      )}

      {/* Paid by — single payer, or "multiple people paid" amount editor */}
      <Sheet open={paidByOpen} onClose={() => setPaidByOpen(false)} title="Who paid?">
        {!multiPayer ? (
          <>
            <div className="max-h-[55vh] overflow-y-auto">
              {members.map((m, i) => (
                <button key={m.id} onClick={() => { setPaidBy(m.id); setPaidByOpen(false); }}
                  className={`tap flex w-full items-center gap-3 px-1 py-3 text-left ${i > 0 ? 'border-t border-line' : ''}`}>
                  <Avatar id={m.id} name={m.full_name} size={32} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{m.id === me.id ? 'You' : m.full_name}</span>
                  {paidBy === m.id && <Check className="h-5 w-5 text-brand" />}
                </button>
              ))}
            </div>
            <Button full variant="soft" className="mt-3"
              onClick={() => { setMultiPayer(true); setPayAmounts({ [paidBy]: amount }); }}>
              + Multiple people paid
            </Button>
          </>
        ) : (
          <>
            <p className="mb-2 text-[13px] text-ink-muted">
              Enter how much each person paid. Must total {totalCents > 0 ? fromCents(totalCents, groupCurrency) : 'the amount'}.
            </p>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar id={m.id} name={m.full_name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{m.id === me.id ? 'You' : m.full_name}</span>
                  <input inputMode="decimal" placeholder="0"
                    value={payAmounts[m.id] ?? ''}
                    onChange={(e) => setPayAmounts((cur) => ({ ...cur, [m.id]: e.target.value }))}
                    className="h-10 w-28 rounded-xl border border-line bg-white px-3 text-right text-[15px] text-ink outline-none focus:border-brand" />
                </div>
              ))}
            </div>
            <p className={`mt-2 text-[13px] font-medium ${multiPayerValid ? 'text-owed' : 'text-owe'}`}>
              {totalCents <= 0
                ? 'Enter the total amount first.'
                : paidSum === totalCents
                  ? `Adds up to ${fromCents(totalCents, groupCurrency)} ✓`
                  : paidSum < totalCents
                    ? `${fromCents(totalCents - paidSum, groupCurrency)} left to assign`
                    : `${fromCents(paidSum - totalCents, groupCurrency)} over the total`}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="soft" className="flex-1" onClick={() => { setMultiPayer(false); setPayAmounts({}); }}>Single payer</Button>
              <Button className="flex-1" onClick={() => setPaidByOpen(false)} disabled={!multiPayerValid}>Done</Button>
            </div>
          </>
        )}
      </Sheet>

      {/* Split between — popup multi-select */}
      <Sheet open={splitOpen} onClose={() => setSplitOpen(false)} title="Split between">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] text-ink-muted">{activeParticipants.length} of {members.length} selected</span>
          <div className="flex gap-3 text-[13px] font-medium">
            <button className="tap text-brand" onClick={() => setParticipants(members.map((m) => m.id))}>Select all</button>
            <button className="tap text-ink-muted" onClick={() => setParticipants([])}>None</button>
          </div>
        </div>
        {members.length > 6 && (
          <Input className="mb-2" placeholder="Search members…" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />
        )}
        <div className="max-h-[50vh] overflow-y-auto">
          {members
            .filter((m) => (m.id === me.id ? 'you' : m.full_name).toLowerCase().includes(memberQuery.trim().toLowerCase()))
            .map((m, i) => {
              const on = activeParticipants.includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleParticipant(m.id)}
                  className={`tap flex w-full items-center gap-3 px-1 py-3 text-left ${i > 0 ? 'border-t border-line' : ''}`}>
                  <Avatar id={m.id} name={m.full_name} size={32} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
                    {m.id === me.id ? 'You' : m.full_name}
                    {m.id === paidBy && <span className="ml-1.5 text-[11px] font-normal text-ink-muted">· paid</span>}
                  </span>
                  <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-md border ${on ? 'border-owed bg-owed text-white' : 'border-line'}`}>
                    {on && <Check className="h-4 w-4" />}
                  </span>
                </button>
              );
            })}
        </div>
        <Button full className="mt-3" onClick={() => setSplitOpen(false)}>Done</Button>
      </Sheet>
    </AppShell>
  );
}
