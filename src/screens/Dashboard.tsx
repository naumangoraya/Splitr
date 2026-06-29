import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { useNotifications } from '@/hooks/useNotifications';
import { db } from '@/data/db';
import { AppShell, Header } from '@/components/layout/AppShell';
import { Avatar, Spinner, ErrorState, EmptyState, Button, Sheet } from '@/components/ui';
import { fromCents } from '@/lib/money';
import { netLabel } from '@/lib/balanceText';
import { Plus, ChevronRight, Bell, MessageCircle, Maximize2 } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const me = user!;
  const notif = useNotifications(me.id);
  const [notifOpen, setNotifOpen] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [groups, friends, activity] = await Promise.all([
      db.listGroups(me.id),
      db.listFriendDirectGroups(me.id),
      db.listActivityDetailed(me.id)
    ]);
    return { groups, friends, activity };
  }, [me.id]);

  const all = [...(data?.groups ?? []), ...(data?.friends ?? [])];
  const owed = all.filter((g) => g.netCents > 0).reduce((a, g) => a + g.netCents, 0);
  const owe = all.filter((g) => g.netCents < 0).reduce((a, g) => a - g.netCents, 0);

  return (
    <AppShell header={<Header title={`Hi, ${me.full_name.split(' ')[0]}`} right={
      <div className="flex items-center gap-0.5">
        <button onClick={() => nav('/chats')} aria-label="Chats"
          className="tap relative flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft">
          <MessageCircle className="h-[22px] w-[22px]" />
          {notif.messageUnread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
              {notif.messageUnread > 9 ? '9+' : notif.messageUnread}
            </span>
          )}
        </button>
        <button onClick={() => { setNotifOpen(true); notif.markGeneralRead(); }} aria-label="Notifications"
          className="tap relative flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft">
          <Bell className="h-[22px] w-[22px]" />
          {notif.generalUnread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-owe px-1 text-[10px] font-bold text-white">
              {notif.generalUnread > 9 ? '9+' : notif.generalUnread}
            </span>
          )}
        </button>
        <Button variant="soft" className="ml-1 h-10 px-2.5" onClick={() => nav('/add')}><Plus className="h-4 w-4" /> Add</Button>
      </div>
    } />}>
      {loading ? (
        <Spinner label="Loading your balances…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-owed-wash p-4">
              <p className="text-[12.5px] font-medium text-owed">You'll get</p>
              <p className="tabular mt-1 font-display text-[22px] font-bold text-owed">{fromCents(owed, me.preferred_currency)}</p>
            </div>
            <div className="rounded-2xl bg-owe-wash p-4">
              <p className="text-[12.5px] font-medium text-owe">You'll pay</p>
              <p className="tabular mt-1 font-display text-[22px] font-bold text-owe">{fromCents(owe, me.preferred_currency)}</p>
            </div>
          </div>

          <h2 className="mb-2 mt-6 font-display text-[15px] font-semibold text-ink-soft">Your groups</h2>
          {data!.groups.length === 0 ? (
            <EmptyState title="No groups yet" body="Create a group to start splitting shared costs." action={<Button variant="soft" onClick={() => nav('/groups')}>Go to groups</Button>} />
          ) : (
            <div className="overflow-hidden rounded-2xl bg-card shadow-card">
              {data!.groups.map(({ group, netCents }, i) => (
                <button
                  key={group.id}
                  onClick={() => nav(`/group/${group.id}`)}
                  className={`tap flex w-full items-center gap-3 px-4 py-3.5 text-left ${i > 0 ? 'border-t border-line' : ''}`}
                >
                  <Avatar id={group.id} name={group.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{group.name}</p>
                    <p className="text-[13px] text-ink-muted">{netCents === 0 ? 'Settled' : `${netLabel(netCents)} ${fromCents(Math.abs(netCents), me.preferred_currency)}`}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-ink-muted" />
                </button>
              ))}
            </div>
          )}

          <div className="mb-2 mt-6 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold text-ink-soft">Recent activity</h2>
            <button onClick={() => nav('/activity')} className="tap text-[13px] font-medium text-brand">See all</button>
          </div>
          {data!.activity.length === 0 ? (
            <p className="px-1 text-[14px] text-ink-muted">Nothing yet.</p>
          ) : (
            <div className="space-y-2">
              {data!.activity.slice(0, 8).map((a) => {
                const isExpense = a.type === 'expense_added';
                const isSettlement = a.type === 'settlement';
                const iActed = a.actorId === me.id;
                const iPaid = a.paidById === me.id;
                const myShare = a.participants.find((p) => p.userId === me.id)?.owedCents ?? 0;
                const myDelta = isExpense ? (iPaid ? a.amountCents - myShare : -myShare) : 0;
                return (
                  <div key={a.id} className="flex items-center gap-2 rounded-xl bg-card px-4 py-3 text-[14px] text-ink-soft shadow-card">
                    <div className="min-w-0 flex-1">
                      {isExpense && <b className="text-ink">{a.description || 'Expense'}</b>}
                      {isSettlement && <>Payment recorded</>}
                      {!isExpense && !isSettlement && <>{a.type.replace(/_/g, ' ')}</>}
                      <p className="text-[12px] text-ink-muted">
                        {isExpense && a.amountCents > 0 && <>Total {fromCents(a.amountCents, me.preferred_currency)} · </>}
                        {a.groupLabel} · {new Date(a.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {isExpense && myDelta !== 0 && (
                      <div className="flex-none text-right">
                        <p className={`tabular text-[14px] font-semibold ${myDelta > 0 ? 'text-owed' : 'text-owe'}`}>
                          {myDelta > 0 ? '+' : '-'}{fromCents(Math.abs(myDelta), me.preferred_currency)}
                        </p>
                        <p className="text-[11px] text-ink-muted">{myDelta > 0 ? "you'll get" : "you'll pay"}</p>
                      </div>
                    )}
                    {isSettlement && a.amountCents > 0 && (
                      // settlement actor is the payer (money LEFT them) → red; receiver → green
                      <span className={`tabular flex-none text-[14px] font-semibold ${iActed ? 'text-owe' : 'text-owed'}`}>
                        {iActed ? '-' : '+'}{fromCents(a.amountCents, me.preferred_currency)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Sheet open={notifOpen} onClose={() => setNotifOpen(false)} title="Notifications">
        {notif.general.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-ink-muted">No notifications yet.</p>
        ) : (
          <>
            {/* ~5 visible, rest scrolls; "Expand" opens the full-screen list */}
            <div className="max-h-[20rem] space-y-2 overflow-y-auto">
              {notif.general.slice(0, 20).map((n) => (
                <button key={n.id}
                  onClick={() => { setNotifOpen(false); if (n.group_id) nav(`/group/${n.group_id}`); }}
                  className="tap flex w-full items-start gap-3 rounded-xl bg-card px-3.5 py-3 text-left shadow-card">
                  <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-wash text-brand">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-ink">{n.body}</p>
                    <p className="text-[11px] text-ink-muted">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </button>
              ))}
            </div>
            <Button full variant="soft" className="mt-3" onClick={() => { setNotifOpen(false); nav('/notifications'); }}>
              <Maximize2 className="h-4 w-4" /> See all notifications
            </Button>
          </>
        )}
      </Sheet>
    </AppShell>
  );
}
