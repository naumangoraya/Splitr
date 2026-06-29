import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner, ErrorState, EmptyState, Button, Avatar, Input, Sheet } from '@/components/ui';
import { computeBalances, pairwiseEdges, expenseNet } from '@/lib/balances';
import { simplifyDebts, nettedPairwise } from '@/lib/debt';
import { fromCents } from '@/lib/money';
import { expensesToCsv, downloadCsv } from '@/lib/csv';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Download, UserPlus, Trash2, CheckCircle2, AlertTriangle, RotateCcw, MessageCircle, Users, LogOut } from 'lucide-react';

export default function GroupDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [expandedExp, setExpandedExp] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(() => db.getGroup(id!), [id]);
  const friends = useAsync(() => db.listFriends(me.id), [me.id]);

  if (loading) return <AppShell><Spinner label="Loading group…" /></AppShell>;
  if (error || !data) return <AppShell><ErrorState message={error ?? 'Group not found'} onRetry={reload} /></AppShell>;

  const { group, members, expenses, settlements } = data;
  const currency = group.default_currency;
  const balances = computeBalances(members, expenses, settlements);
  const myNetCents = balances.find((b) => b.userId === me.id)?.netCents ?? 0;
  const nameOf = (uid: string) => members.find((m) => m.id === uid)?.full_name ?? '—';

  const transfers = group.simplify_debts
    ? simplifyDebts(balances)
    : nettedPairwise(pairwiseEdges(expenses, settlements)).map((e) => ({
        fromUser: e.fromUser, fromName: nameOf(e.fromUser), toUser: e.toUser, toName: nameOf(e.toUser), amountCents: e.amountCents
      }));

  async function inviteByEmail(email: string) {
    const clean = email.trim();
    if (!clean || inviteBusy) return;
    setInviteBusy(true);
    setInviteError(null);
    setInviteMsg(null);
    try {
      const res = await db.inviteToGroup(group.id, clean, me.id);
      setInviteEmail('');
      if (res.status === 'added') {
        setInviteMsg('Added — they’re now in this group.');
        reload();
      } else {
        setInviteMsg('Invite saved. They’ll join automatically when they sign up with that email.');
      }
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not send the invite');
    } finally {
      setInviteBusy(false);
    }
  }

  async function remove(expenseId: string) {
    if (!confirm('Delete this expense? Balances will update.')) return;
    setRowError(null);
    try {
      await db.deleteExpense(expenseId);
      reload();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not delete the expense');
    }
  }

  // per-person (per-split) settle / dispute / reopen
  async function actOnSplit(_expenseId: string, _userId: string, fn: () => Promise<void>) {
    setRowError(null);
    try { await fn(); reload(); }
    catch (e) { setRowError(e instanceof Error ? e.message : 'Could not update that share'); }
  }

  const iAmOwner = group.created_by === me.id;

  async function removeMember(userId: string, name: string) {
    const theirNet = balances.find((b) => b.userId === userId)?.netCents ?? 0;
    if (theirNet !== 0) { setRowError(`${name} has an unsettled balance — settle up before removing them.`); return; }
    if (!confirm(`Remove ${name} from this group?`)) return;
    setMemberBusy(userId);
    setRowError(null);
    try { await db.removeMember(me.id, group.id, userId); reload(); }
    catch (e) { setRowError(e instanceof Error ? e.message : 'Could not remove member'); }
    finally { setMemberBusy(null); }
  }

  async function leaveGroup() {
    if (iAmOwner) { setRowError('You created this group — delete it instead, or transfer it isn’t supported yet.'); setMembersOpen(false); return; }
    if (myNetCents !== 0) { setRowError('Settle up before leaving — your balance isn’t zero.'); setMembersOpen(false); return; }
    if (!confirm('Leave this group? You’ll stop seeing its expenses.')) return;
    setMemberBusy(me.id);
    try { await db.leaveGroup(me.id, group.id); nav('/groups'); }
    catch (e) { setRowError(e instanceof Error ? e.message : 'Could not leave the group'); setMemberBusy(null); }
  }

  async function deleteGroup() {
    if (!confirm('Delete this group for everyone? This removes all its expenses and chat. This cannot be undone.')) return;
    setMemberBusy('__del__');
    try { await db.deleteGroup(me.id, group.id); nav('/groups'); }
    catch (e) { setRowError(e instanceof Error ? e.message : 'Could not delete the group'); setMemberBusy(null); }
  }

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-canvas/90 px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <button className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl -ml-1" onClick={() => nav(-1)}><ChevronLeft className="h-6 w-6 text-ink-soft" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[18px] font-bold text-ink">{group.name}</h1>
            <p className="text-[12px] text-ink-muted">{members.length} {members.length === 1 ? 'member' : 'members'}{group.simplify_debts ? ' · simplified' : ''}</p>
          </div>
          <button className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl" onClick={() => nav(`/group/${group.id}/chat`)} aria-label="Open chat"><MessageCircle className="h-[22px] w-[22px] text-ink-soft" /></button>
          <button className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl" onClick={() => setMembersOpen(true)} aria-label="Members"><Users className="h-[22px] w-[22px] text-ink-soft" /></button>
          <button className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl" onClick={() => downloadCsv(`${group.name}.csv`, expensesToCsv(expenses, members))} aria-label="Export CSV">
            <Download className="h-[22px] w-[22px] text-ink-soft" />
          </button>
        </header>
      }
    >
      <div className="px-5 py-4">
        {/* Balance summary → full Balances screen */}
        <button onClick={() => nav(`/group/${group.id}/balances`)}
          className="tap flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card">
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-ink-muted">Your balance in this group</p>
            <p className={`font-display text-[20px] font-bold ${myNetCents > 0 ? 'text-owed' : myNetCents < 0 ? 'text-owe' : 'text-ink'}`}>
              {myNetCents === 0 ? 'Settled up' : myNetCents > 0 ? `You'll get ${fromCents(myNetCents, currency)}` : `You'll pay ${fromCents(-myNetCents, currency)}`}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {transfers.length === 0 ? 'Nothing to settle' : `${transfers.length} ${transfers.length === 1 ? 'transfer' : 'transfers'} · tap to view & settle`}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 flex-none text-ink-muted" />
        </button>

        {/* Expenses */}
        <div className="mb-2 mt-6 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold text-ink-soft">Expenses</h2>
          <Button variant="soft" className="h-9 px-3 text-[13px]" onClick={() => nav(`/add/${group.id}`)}><Plus className="h-4 w-4" /> Add</Button>
        </div>

        {rowError && <p className="mb-2 text-[13px] text-owe">{rowError}</p>}

        {expenses.length === 0 ? (
          <EmptyState title="No expenses yet" body="Add the first shared cost to see balances appear." action={<Button onClick={() => nav(`/add/${group.id}`)}>Add expense</Button>} />
        ) : (
          <div className="space-y-2">
            {expenses.map((e) => {
              const mySplit = e.splits.find((s) => s.user_id === me.id);
              const myPaid = (e.payments && e.payments.length > 0
                ? e.payments.filter((p) => p.user_id === me.id).reduce((a, p) => a + p.amount_cents, 0)
                : (e.paid_by === me.id ? e.amount_cents : 0));
              const iPaid = myPaid > 0;
              const net = expenseNet(e).get(me.id) ?? 0;   // my active net on this expense
              const open = expandedExp === e.id;
              const payers = (e.payments && e.payments.length > 0
                ? e.payments
                : [{ user_id: e.paid_by, amount_cents: e.amount_cents }]).filter((p) => p.amount_cents > 0);
              const paidBySplit = (uid: string) => (e.payments && e.payments.length > 0
                ? e.payments.filter((p) => p.user_id === uid).reduce((a, p) => a + p.amount_cents, 0)
                : (e.paid_by === uid ? e.amount_cents : 0));
              // a "debt" = a split where the person owes MORE than they paid (handles partial payers)
              const debtSplits = e.splits.filter((s) => s.amount_owed_cents - paidBySplit(s.user_id) > 0);
              const settledDebts = debtSplits.filter((s) => Boolean(s.settled_at)).length;
              const disputedDebts = debtSplits.filter((s) => Boolean(s.disputed_at)).length;
              // FULLY settled: legacy whole-expense flag, OR there are debts and none are still active
              // (every debt is either settled or disputed, with at least one settled).
              const fullySettled = Boolean(e.settled_at) ||
                (debtSplits.length > 0 && settledDebts + disputedDebts === debtSplits.length && settledDebts > 0);
              const partiallySettled = !fullySettled && (settledDebts > 0 || disputedDebts > 0);
              // a dispute by ANYONE tints the card, but does NOT freeze other people's actions
              const anyDisputed = Boolean(e.disputed_at) || disputedDebts > 0;
              const inactive = fullySettled || Boolean(e.settled_at) || Boolean(e.disputed_at);
              // I can settle/dispute MY OWN share only if I actually still owe and it's active
              const myOwes = mySplit ? mySplit.amount_owed_cents - paidBySplit(me.id) : 0;
              const myShareActive = !Boolean(e.settled_at) && !Boolean(e.disputed_at) && Boolean(
                mySplit && myOwes > 0 &&
                !mySplit.settled_at && !mySplit.disputed_at
              );
              return (
                <div key={e.id} className={`rounded-xl shadow-card ${anyDisputed ? 'bg-owe-wash' : 'bg-card'} ${fullySettled ? 'opacity-55' : ''}`}>
                  {/* main row — tap to expand the tree */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => setExpandedExp(open ? null : e.id)} className="tap flex min-w-0 flex-1 items-center gap-3 text-left">
                      <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl text-[11px] font-semibold uppercase ${inactive ? 'bg-line text-ink-muted' : 'bg-brand-wash text-brand'}`}>
                        {e.category.slice(0, 3)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate font-semibold text-ink">
                          <span className="truncate">{e.description}</span>
                          {fullySettled && <span className="flex-none rounded-full bg-line px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-muted">Settled</span>}
                          {!fullySettled && partiallySettled && <span className="flex-none rounded-full bg-line px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-muted">{settledDebts}/{debtSplits.length} settled</span>}
                          {anyDisputed && <span className="flex-none rounded-full bg-owe px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Disputed</span>}
                        </p>
                        <p className="text-[12.5px] text-ink-muted">
                          {payers.length === 1
                            ? <>{payers[0].user_id === me.id ? 'You' : nameOf(payers[0].user_id)} paid {fromCents(e.amount_cents, currency)}</>
                            : <>{payers.length} people paid {fromCents(e.amount_cents, currency)}</>}
                        </p>
                      </div>
                      <p className={`tabular flex-none text-[13.5px] font-semibold ${net > 0 ? 'text-owed' : net < 0 ? 'text-owe' : 'text-ink-muted'}`}>
                        {net > 0 ? `+${fromCents(net, currency)}` : net < 0 ? `-${fromCents(-net, currency)}` : '—'}
                      </p>
                      <ChevronDown className={`h-4 w-4 flex-none text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    <div className="flex flex-none items-center gap-0.5">
                      {/* settle/dispute MY share from the header */}
                      {myShareActive && (
                        <>
                          <button onClick={() => actOnSplit(e.id, me.id, () => db.settleSplit(e.id, me.id))} title="Settle my share" aria-label="Settle my share" className="tap flex h-8 w-8 items-center justify-center rounded-lg text-owed"><CheckCircle2 className="h-[18px] w-[18px]" /></button>
                          <button onClick={() => actOnSplit(e.id, me.id, () => db.disputeSplit(e.id, me.id))} title="Dispute my share" aria-label="Dispute my share" className="tap flex h-8 w-8 items-center justify-center rounded-lg text-owe"><AlertTriangle className="h-[18px] w-[18px]" /></button>
                        </>
                      )}
                      {iPaid && (
                        <button onClick={() => remove(e.id)} title="Delete" aria-label="Delete expense" className="tap flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted"><Trash2 className="h-[18px] w-[18px]" /></button>
                      )}
                    </div>
                  </div>

                  {/* expandable tree: paid by → split → who owes whom */}
                  {open && (
                    <div className="border-t border-line/70 px-4 py-3 text-[13px]">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Paid by</p>
                      {payers.map((p) => (
                        <div key={p.user_id} className="flex items-center justify-between py-0.5">
                          <span className="text-ink-soft">{p.user_id === me.id ? 'You' : nameOf(p.user_id)}</span>
                          <span className="tabular font-medium text-owed">{fromCents(p.amount_cents, currency)}</span>
                        </div>
                      ))}
                      <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Split</p>
                      {e.splits.map((s) => {
                        const sOwes = s.amount_owed_cents - paidBySplit(s.user_id); // net owed on this expense
                        const sSettled = Boolean(s.settled_at);
                        const sDisputed = Boolean(s.disputed_at);
                        // can act if this person still owes AND (it's my row, or I'm a payer owed the money).
                        // Frozen only if the WHOLE expense is settled/disputed (one person's split state
                        // doesn't block others).
                        const canAct = sOwes > 0 && !Boolean(e.settled_at) && !Boolean(e.disputed_at) && (s.user_id === me.id || iPaid);
                        return (
                          <div key={s.user_id} className="flex items-center gap-2 py-1">
                            <span className={`min-w-0 flex-1 truncate ${sSettled ? 'text-ink-muted line-through' : 'text-ink-soft'}`}>
                              {s.user_id === me.id ? 'You' : nameOf(s.user_id)}
                              {sSettled && <span className="ml-1.5 text-[10px] font-semibold uppercase text-owed">settled</span>}
                              {sDisputed && <span className="ml-1.5 text-[10px] font-semibold uppercase text-owe">disputed</span>}
                            </span>
                            <span className="tabular text-ink">{fromCents(s.amount_owed_cents, currency)}</span>
                            {canAct && !sSettled && !sDisputed && (
                              <span className="flex flex-none items-center gap-0.5">
                                <button onClick={() => actOnSplit(e.id, s.user_id, () => db.settleSplit(e.id, s.user_id))} title="Settle" aria-label="Settle share" className="tap flex h-7 w-7 items-center justify-center rounded-md text-owed"><CheckCircle2 className="h-4 w-4" /></button>
                                {s.user_id === me.id && (
                                  <button onClick={() => actOnSplit(e.id, s.user_id, () => db.disputeSplit(e.id, s.user_id))} title="Dispute" aria-label="Dispute share" className="tap flex h-7 w-7 items-center justify-center rounded-md text-owe"><AlertTriangle className="h-4 w-4" /></button>
                                )}
                              </span>
                            )}
                            {canAct && (sSettled || sDisputed) && (
                              <button onClick={() => actOnSplit(e.id, s.user_id, () => db.reopenSplit(e.id, s.user_id))} title="Reopen" aria-label="Reopen share" className="tap flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-soft"><RotateCcw className="h-4 w-4" /></button>
                            )}
                          </div>
                        );
                      })}
                      {/* legacy whole-expense settle/dispute → let a payer reopen it */}
                      {(Boolean(e.settled_at) || Boolean(e.disputed_at)) && iPaid && (
                        <button onClick={() => actOnSplit(e.id, me.id, () => db.reopenExpense(e.id))}
                          className="tap mt-3 flex items-center gap-1 rounded-md bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-ink-soft shadow-card">
                          <RotateCcw className="h-4 w-4" /> Reopen whole expense
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={inviteOpen} onClose={() => { setInviteOpen(false); setInviteError(null); setInviteMsg(null); }} title="Add to group">
        <div className="space-y-4">
          {(() => {
            const memberIds = new Set(members.map((m) => m.id));
            const addable = (friends.data ?? []).filter((f) => !memberIds.has(f.id));
            if (addable.length === 0) return null;
            return (
              <div>
                <span className="mb-2 block text-[13px] font-medium text-ink-soft">Your friends</span>
                <div className="overflow-hidden rounded-xl bg-card shadow-card">
                  {addable.map((f, i) => (
                    <button key={f.id} onClick={() => inviteByEmail(f.email)} disabled={inviteBusy}
                      className={`tap flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-50 ${i > 0 ? 'border-t border-line' : ''}`}>
                      <Avatar id={f.id} name={f.full_name || f.email} size={32} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{f.full_name || f.email}</span>
                      <span className="text-[13px] font-semibold text-brand">Add</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          <div>
            <Input label="Add someone new" type="email" placeholder="friend@email.com" value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteMsg(null); }}
              hint="If they already use Splitr they’re added now; otherwise they join when they sign up." />
            <Button full className="mt-2" onClick={() => inviteByEmail(inviteEmail)} disabled={!inviteEmail.trim() || inviteBusy}>
              {inviteBusy ? 'Sending…' : 'Invite by email'}
            </Button>
          </div>

          {inviteError && <p className="text-[13px] text-owe">{inviteError}</p>}
          {inviteMsg && <p className="text-[13px] text-owed">{inviteMsg}</p>}
        </div>
      </Sheet>

      {/* Members — roster, remove (owner), invite, leave / delete */}
      <Sheet open={membersOpen} onClose={() => setMembersOpen(false)} title={`Members · ${members.length}`}>
        <div className="max-h-[55vh] overflow-y-auto">
          {members.map((m, i) => (
            <div key={m.id} className={`flex items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-line' : ''}`}>
              <Avatar id={m.id} name={m.full_name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink">{m.id === me.id ? 'You' : m.full_name}</p>
                <p className="text-[12px] text-ink-muted capitalize">{m.role}{m.id === group.created_by ? ' · creator' : ''}</p>
              </div>
              {iAmOwner && m.id !== me.id && (
                <button onClick={() => removeMember(m.id, m.full_name)} disabled={memberBusy === m.id}
                  className="tap rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-owe disabled:opacity-40">Remove</button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-line pt-4">
          {!group.is_direct && (
            <Button full variant="soft" onClick={() => { setMembersOpen(false); setInviteOpen(true); }}>
              <UserPlus className="h-4 w-4" /> Add people
            </Button>
          )}
          {!group.is_direct && !iAmOwner && (
            <Button full variant="ghost" className="text-owe" onClick={leaveGroup} disabled={memberBusy === me.id}>
              <LogOut className="h-4 w-4" /> Leave group
            </Button>
          )}
          {iAmOwner && (
            <Button full variant="danger" onClick={deleteGroup} disabled={memberBusy === '__del__'}>
              <Trash2 className="h-4 w-4" /> Delete group
            </Button>
          )}
        </div>
      </Sheet>
    </AppShell>
  );
}
