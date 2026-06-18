import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner, ErrorState, EmptyState, Button, Avatar, Input, Sheet } from '@/components/ui';
import { SettleUpSheet } from '@/components/group/SettleUpSheet';
import { computeBalances, pairwiseEdges } from '@/lib/balances';
import { simplifyDebts, nettedPairwise, type Transfer } from '@/lib/debt';
import { fromCents } from '@/lib/money';
import { expensesToCsv, downloadCsv } from '@/lib/csv';
import { ChevronLeft, Plus, ArrowRight, Download, UserPlus, Trash2 } from 'lucide-react';

export default function GroupDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();

  const [settleOpen, setSettleOpen] = useState(false);
  const [suggested, setSuggested] = useState<Transfer | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const { data, loading, error, reload } = useAsync(() => db.getGroup(id!), [id]);

  if (loading) return <AppShell><Spinner label="Loading group…" /></AppShell>;
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

  function openSettle(t: Transfer | null) {
    setSuggested(t);
    setSettleOpen(true);
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    await db.inviteToGroup(group.id, inviteEmail.trim(), me.id);
    setInviteEmail('');
    setInviteOpen(false);
    alert('Invite sent. They’ll join automatically when they sign up with that email.');
  }

  async function remove(expenseId: string) {
    if (!confirm('Delete this expense? Balances will update.')) return;
    await db.deleteExpense(expenseId);
    reload();
  }

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-canvas/90 px-3 py-3 backdrop-blur">
          <button className="tap rounded-lg p-1.5" onClick={() => nav(-1)}><ChevronLeft className="h-5 w-5 text-ink-soft" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[18px] font-bold text-ink">{group.name}</h1>
            <p className="text-[12px] text-ink-muted">{members.length} {members.length === 1 ? 'member' : 'members'}{group.simplify_debts ? ' · simplified' : ''}</p>
          </div>
          {!group.is_direct && (
            <button className="tap rounded-lg p-1.5" onClick={() => setInviteOpen(true)}><UserPlus className="h-5 w-5 text-ink-soft" /></button>
          )}
          <button className="tap rounded-lg p-1.5" onClick={() => downloadCsv(`${group.name}.csv`, expensesToCsv(expenses, members))}>
            <Download className="h-5 w-5 text-ink-soft" />
          </button>
        </header>
      }
    >
      <div className="px-5 py-4">
        {/* Balances / settle suggestions */}
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold text-ink">Who owes who</h2>
            <Button variant="soft" className="h-9 px-3 text-[13px]" onClick={() => openSettle(null)}>Settle up</Button>
          </div>
          {transfers.length === 0 ? (
            <p className="py-2 text-[14px] text-ink-muted">Everyone’s settled up 🎉</p>
          ) : (
            <div className="space-y-2">
              {transfers.map((t, i) => (
                <button key={i} onClick={() => openSettle(t)} className="tap flex w-full items-center gap-2 rounded-xl bg-canvas px-3 py-2.5 text-left">
                  <Avatar id={t.fromUser} name={t.fromName} size={28} />
                  <span className="text-[13.5px] font-medium text-ink">{t.fromUser === me.id ? 'You' : t.fromName}</span>
                  <ArrowRight className="h-4 w-4 text-ink-muted" />
                  <Avatar id={t.toUser} name={t.toName} size={28} />
                  <span className="text-[13.5px] font-medium text-ink">{t.toUser === me.id ? 'You' : t.toName}</span>
                  <span className="tabular ml-auto text-[14px] font-semibold text-brand">{fromCents(t.amountCents, currency)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Expenses */}
        <div className="mb-2 mt-6 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold text-ink-soft">Expenses</h2>
          <Button variant="soft" className="h-9 px-3 text-[13px]" onClick={() => nav(`/add/${group.id}`)}><Plus className="h-4 w-4" /> Add</Button>
        </div>

        {expenses.length === 0 ? (
          <EmptyState title="No expenses yet" body="Add the first shared cost to see balances appear." action={<Button onClick={() => nav(`/add/${group.id}`)}>Add expense</Button>} />
        ) : (
          <div className="space-y-2">
            {expenses.map((e) => {
              const mine = e.splits.find((s) => s.user_id === me.id)?.amount_owed_cents ?? 0;
              const lent = e.paid_by === me.id ? e.amount_cents - mine : 0;
              const net = lent - (e.paid_by === me.id ? 0 : mine);
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-card">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-wash text-[11px] font-semibold uppercase text-brand">
                    {e.category.slice(0, 3)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{e.description}</p>
                    <p className="text-[12.5px] text-ink-muted">
                      {e.paid_by === me.id ? 'You' : nameOf(e.paid_by)} paid {fromCents(e.amount_cents, currency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`tabular text-[13.5px] font-semibold ${net > 0 ? 'text-owed' : net < 0 ? 'text-owe' : 'text-ink-muted'}`}>
                      {net > 0 ? `+${fromCents(net, currency)}` : net < 0 ? `-${fromCents(-net, currency)}` : '—'}
                    </p>
                  </div>
                  <button className="tap rounded-lg p-1.5" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-ink-muted" /></button>
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
        suggested={suggested}
        onDone={reload}
      />

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite to group">
        <div className="space-y-3">
          <Input label="Email" type="email" placeholder="friend@email.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} hint="They’ll join automatically when they sign up with this email." />
          <Button full onClick={invite} disabled={!inviteEmail.trim()}>Send invite</Button>
        </div>
      </Sheet>
    </AppShell>
  );
}
