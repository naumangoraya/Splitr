import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell, Header } from '@/components/layout/AppShell';
import { Avatar, Spinner, ErrorState, EmptyState, Button } from '@/components/ui';
import { fromCents } from '@/lib/money';
import { Receipt, ArrowLeftRight, Clock, ChevronDown, AlertCircle } from 'lucide-react';

export default function Activity() {
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();
  const { data, loading, error, reload } = useAsync(() => db.listActivityDetailed(me.id), [me.id]);
  const pending = useAsync(() => db.listPendingSettlements(me.id), [me.id]);
  const [pErr, setPErr] = useState<string | null>(null);
  const [pBusy, setPBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const who = (id: string | null, name: string | null) => (id === me.id ? 'You' : (name ?? '—'));

  async function act(id: string, fn: () => Promise<void>) {
    setPErr(null);
    setPBusy(id);
    try {
      await fn();
      pending.reload();
      reload();
    } catch (e) {
      setPErr(e instanceof Error ? e.message : 'Could not update the request');
    } finally {
      setPBusy(null);
    }
  }

  return (
    <AppShell header={<Header title="Activity" />}>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (data ?? []).length === 0 && (pending.data ?? []).length === 0 ? (
        <EmptyState title="No activity yet" body="Expenses and payments across all your groups and friends show up here." />
      ) : (
        <div className="space-y-5 px-5 py-4">
          {/* Pending settle-up confirmations */}
          {(pending.data ?? []).length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-soft">Pending confirmations</p>
              {pErr && <p className="mb-2 text-[13px] text-owe">{pErr}</p>}
              <div className="space-y-2">
                {pending.data!.map(({ settlement: s, group, fromName, toName }) => {
                  // s.from_user = debtor (paid); s.to_user = creditor (owed) = the authority.
                  const iAmCreditor = s.to_user === me.id;   // I can confirm / dispute / delete
                  const iAmDebtor = s.from_user === me.id;    // I can cancel my own pending request
                  const disputed = s.status === 'disputed';
                  // amber = pending, red = disputed
                  const tone = disputed
                    ? { card: 'border border-owe/40 bg-owe-wash', icon: 'bg-owe-wash text-owe' }
                    : { card: 'border border-[#d97706]/40 bg-[#fff7ed]', icon: 'bg-[#fef3c7] text-[#d97706]' };
                  return (
                    <div key={s.id} className={`rounded-xl px-4 py-3 ${tone.card}`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${tone.icon}`}>
                          {disputed ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-ink">
                            <b>{iAmDebtor ? 'You' : fromName}</b> paid <b>{iAmCreditor ? 'you' : toName}</b> {fromCents(s.amount_cents, me.preferred_currency)}
                          </p>
                          <p className="text-[12px] text-ink-muted">
                            {group?.is_direct ? 'Personal' : (group?.name ?? '—')} ·{' '}
                            {disputed
                              ? 'disputed — not counted'
                              : iAmCreditor ? 'awaiting your confirmation' : 'waiting for them to confirm'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {iAmCreditor && !disputed && (
                          <>
                            <Button className="h-9 flex-1 text-[13px]" onClick={() => act(s.id, () => db.confirmSettlement(s.id))} disabled={pBusy === s.id}>
                              {pBusy === s.id ? '…' : 'Confirm received'}
                            </Button>
                            <Button variant="soft" className="h-9 flex-1 text-[13px]" onClick={() => act(s.id, () => db.disputeSettlement(s.id))} disabled={pBusy === s.id}>
                              Dispute
                            </Button>
                          </>
                        )}
                        {iAmCreditor && disputed && (
                          <>
                            <Button className="h-9 flex-1 text-[13px]" onClick={() => act(s.id, () => db.confirmSettlement(s.id))} disabled={pBusy === s.id}>
                              Accept after all
                            </Button>
                            <Button variant="danger" className="h-9 flex-1 text-[13px]" onClick={() => act(s.id, () => db.deleteSettlement(s.id))} disabled={pBusy === s.id}>
                              Delete
                            </Button>
                          </>
                        )}
                        {iAmDebtor && !disputed && (
                          <Button variant="soft" className="h-9 flex-1 text-[13px]" onClick={() => act(s.id, () => db.deleteSettlement(s.id))} disabled={pBusy === s.id}>
                            {pBusy === s.id ? '…' : 'Cancel request'}
                          </Button>
                        )}
                        {iAmDebtor && disputed && (
                          <p className="py-1.5 text-[12.5px] text-owe">They disputed this — talk it over, then re-request.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity feed */}
          <div className="space-y-2">
          {data!.map((a) => {
            // Direction relative to me: I acted (paid / sent) => green; else red.
            const iActed = a.actorId === me.id;
            const isSettlement = a.type === 'settlement';
            const isExpense = a.type === 'expense_added';

            // My position on this expense
            const iPaid = a.paidById === me.id;
            const myShare = a.participants.find((p) => p.userId === me.id)?.owedCents ?? 0;
            // If I paid: I get back everyone else's shares. If I didn't: I owe my share.
            const myDeltaCents = iPaid ? a.amountCents - myShare : -myShare;
            const isOpen = expanded === a.id;
            // Per-person tree: who owes me (I paid) or who I owe (someone else paid)
            const tree = isExpense
              ? (iPaid
                  ? a.participants.filter((p) => p.userId !== me.id && p.owedCents > 0)
                      .map((p) => ({ name: p.name, cents: p.owedCents, owesMe: true }))
                  : (myShare > 0 && a.paidById
                      ? [{ name: who(a.paidById, a.participants.find((p) => p.userId === a.paidById)?.name ?? null), cents: myShare, owesMe: false }]
                      : []))
              : [];

            return (
              <div key={a.id} className="rounded-xl bg-card shadow-card">
                <button
                  onClick={() => isExpense ? setExpanded(isOpen ? null : a.id) : (a.groupId && nav(`/group/${a.groupId}`))}
                  className="tap flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${isSettlement ? 'bg-owed-wash text-owed' : 'bg-brand-wash text-brand'}`}>
                    {isSettlement ? <ArrowLeftRight className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">
                      {isExpense && <><b>{who(a.actorId, a.actorName)}</b> added “{a.description || 'Expense'}”</>}
                      {isSettlement && <><b>{who(a.actorId, a.actorName)}</b> paid {who(a.toUserId, a.toUserName)}</>}
                      {!isExpense && !isSettlement && <>{a.type.replace(/_/g, ' ')}</>}
                    </p>
                    <p className="text-[12px] text-ink-muted">
                      {isExpense && a.amountCents > 0 && <>Total {fromCents(a.amountCents, me.preferred_currency)} · </>}
                      {a.groupLabel} · {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* expenses: show "you get back / you owe"; settlements: show amount by direction */}
                  {isExpense && myDeltaCents !== 0 && (
                    <div className="flex-none text-right">
                      <p className={`tabular text-[14px] font-semibold ${myDeltaCents > 0 ? 'text-owed' : 'text-owe'}`}>
                        {myDeltaCents > 0 ? '+' : '-'}{fromCents(Math.abs(myDeltaCents), me.preferred_currency)}
                      </p>
                      <p className="text-[11px] text-ink-muted">{myDeltaCents > 0 ? "you'll get" : "you'll pay"}</p>
                    </div>
                  )}
                  {isSettlement && a.amountCents > 0 && (
                    // settlement actor is the payer (money LEFT them) → red; receiver → green
                    <span className={`tabular flex-none text-[14px] font-semibold ${iActed ? 'text-owe' : 'text-owed'}`}>
                      {iActed ? '-' : '+'}{fromCents(a.amountCents, me.preferred_currency)}
                    </span>
                  )}
                  {isExpense
                    ? <ChevronDown className={`h-5 w-5 flex-none text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    : <Avatar id={a.actorId ?? a.id} name={a.actorName} size={26} />}
                </button>

                {isExpense && isOpen && (
                  <div className="border-t border-line px-4 py-2">
                    {tree.length === 0 ? (
                      <p className="py-1 text-[13px] text-ink-muted">No one owes anything on this one.</p>
                    ) : (
                      tree.map((t, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5">
                          <span className="text-[13.5px] text-ink-soft">
                            {t.owesMe ? <><b>{t.name}</b> pays you</> : <>you'll pay <b>{t.name}</b></>}
                          </span>
                          <span className={`tabular text-[13.5px] font-semibold ${t.owesMe ? 'text-owed' : 'text-owe'}`}>
                            {fromCents(t.cents, me.preferred_currency)}
                          </span>
                        </div>
                      ))
                    )}
                    {a.groupId && (
                      <button onClick={() => nav(`/group/${a.groupId}`)} className="tap mt-1 text-[12.5px] font-medium text-brand">
                        Open {a.groupLabel} →
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </AppShell>
  );
}
