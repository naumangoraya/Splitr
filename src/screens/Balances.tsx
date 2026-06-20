import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner, ErrorState, Button, Avatar } from '@/components/ui';
import { SettleUpSheet } from '@/components/group/SettleUpSheet';
import { computeBalances, pairwiseEdges } from '@/lib/balances';
import { simplifyDebts, nettedPairwise, type Transfer } from '@/lib/debt';
import { fromCents } from '@/lib/money';
import { ChevronLeft, ArrowRight } from 'lucide-react';

export default function Balances() {
  const { id } = useParams();
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();

  const { data, loading, error, reload } = useAsync(() => db.getGroup(id!), [id]);
  const [settleOpen, setSettleOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <AppShell><Spinner label="Loading balances…" /></AppShell>;
  if (error || !data) return <AppShell><ErrorState message={error ?? 'Group not found'} onRetry={reload} /></AppShell>;

  const { group, members, expenses, settlements } = data;
  const currency = group.default_currency;
  const balances = computeBalances(members, expenses, settlements);
  const nameOf = (uid: string) => members.find((m) => m.id === uid)?.full_name ?? '—';

  const transfers = group.simplify_debts
    ? simplifyDebts(balances)
    : nettedPairwise(pairwiseEdges(expenses, settlements)).map((e) => ({
        fromUser: e.fromUser, fromName: nameOf(e.fromUser), toUser: e.toUser, toName: nameOf(e.toUser), amountCents: e.amountCents
      }));

  function pendingFor(fromUser: string, toUser: string) {
    return settlements.find((s) => s.status !== 'confirmed' && s.from_user === fromUser && s.to_user === toUser);
  }

  async function requestSettle(t: Transfer) {
    setRowError(null);
    setBusy(t.fromUser + t.toUser);
    try {
      await db.requestSettlement({
        group_id: group.id, from_user: t.fromUser, to_user: t.toUser,
        amount_cents: t.amountCents, currency, note: null, created_by: me.id
      });
      reload();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not request settle-up');
    } finally { setBusy(null); }
  }

  async function act(settlementId: string, fn: () => Promise<void>) {
    setRowError(null);
    setBusy(settlementId);
    try { await fn(); reload(); }
    catch (e) { setRowError(e instanceof Error ? e.message : 'Could not update the settlement'); }
    finally { setBusy(null); }
  }

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-canvas/90 px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <button className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl -ml-1" onClick={() => nav(-1)}><ChevronLeft className="h-6 w-6 text-ink-soft" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[18px] font-bold text-ink">Balances</h1>
            <p className="text-[12px] text-ink-muted">{group.name}{group.simplify_debts ? ' · simplified' : ''}</p>
          </div>
          <Button variant="soft" className="h-9 px-3 text-[13px]" onClick={() => setSettleOpen(true)}>Settle up</Button>
        </header>
      }
    >
      <div className="px-5 py-4">
        {rowError && <p className="mb-2 text-[13px] text-owe">{rowError}</p>}

        {transfers.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-ink-muted">Everyone’s settled up 🎉</p>
        ) : (
          <div className="space-y-2">
            {transfers.map((t, i) => {
              const pend = pendingFor(t.fromUser, t.toUser);
              const iAmDebtor = t.fromUser === me.id;
              const iAmCreditor = t.toUser === me.id;
              const disputed = pend?.status === 'disputed';
              return (
                <div key={i} className={`rounded-2xl px-4 py-3 shadow-card ${disputed ? 'bg-owe-wash' : pend ? 'bg-[#fff7ed]' : 'bg-card'}`}>
                  <div className="flex items-center gap-2">
                    <Avatar id={t.fromUser} name={t.fromName} size={30} />
                    <span className="text-[14px] font-medium text-ink">{iAmDebtor ? 'You' : t.fromName}</span>
                    <ArrowRight className="h-4 w-4 text-ink-muted" />
                    <Avatar id={t.toUser} name={t.toName} size={30} />
                    <span className="text-[14px] font-medium text-ink">{iAmCreditor ? 'You' : t.toName}</span>
                    <span className={`tabular ml-auto text-[15px] font-semibold ${pend ? 'text-[#d97706]' : 'text-brand'}`}>
                      {fromCents(t.amountCents, currency)}
                    </span>
                  </div>

                  {!pend && iAmDebtor && (
                    <Button variant="soft" className="mt-2 h-9 w-full text-[13px]"
                      onClick={() => requestSettle(t)} disabled={busy === t.fromUser + t.toUser}>
                      {busy === t.fromUser + t.toUser ? '…' : 'Settle up'}
                    </Button>
                  )}
                  {!pend && iAmCreditor && (
                    <p className="mt-1.5 text-[12px] text-ink-muted">Waiting for {t.fromName} to settle, or record it via “Settle up”.</p>
                  )}
                  {pend && !disputed && (
                    <div className="mt-2">
                      <p className="mb-1.5 text-[12px] font-medium text-[#d97706]">
                        {iAmCreditor ? `${t.fromName} marked this paid — confirm you received it.` : 'Sent — awaiting confirmation.'}
                      </p>
                      {iAmCreditor && (
                        <div className="flex gap-2">
                          <Button className="h-9 flex-1 text-[13px]" onClick={() => act(pend.id, () => db.confirmSettlement(pend.id))} disabled={busy === pend.id}>Confirm</Button>
                          <Button variant="soft" className="h-9 flex-1 text-[13px]" onClick={() => act(pend.id, () => db.disputeSettlement(pend.id))} disabled={busy === pend.id}>Dispute</Button>
                        </div>
                      )}
                      {iAmDebtor && (
                        <Button variant="soft" className="h-9 w-full text-[13px]" onClick={() => act(pend.id, () => db.deleteSettlement(pend.id))} disabled={busy === pend.id}>Cancel request</Button>
                      )}
                    </div>
                  )}
                  {disputed && (
                    <div className="mt-2">
                      <p className="mb-1.5 text-[12px] font-medium text-owe">Disputed — not counted until resolved.</p>
                      {iAmCreditor && (
                        <div className="flex gap-2">
                          <Button className="h-9 flex-1 text-[13px]" onClick={() => act(pend!.id, () => db.confirmSettlement(pend!.id))} disabled={busy === pend!.id}>Accept</Button>
                          <Button variant="danger" className="h-9 flex-1 text-[13px]" onClick={() => act(pend!.id, () => db.deleteSettlement(pend!.id))} disabled={busy === pend!.id}>Delete</Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SettleUpSheet
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        groupId={group.id}
        currency={currency}
        members={members}
        meId={me.id}
        suggested={null}
        onDone={reload}
      />
    </AppShell>
  );
}
