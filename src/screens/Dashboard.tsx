import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell, Header } from '@/components/layout/AppShell';
import { Avatar, Spinner, ErrorState, EmptyState, Button } from '@/components/ui';
import { fromCents } from '@/lib/money';
import { Plus, ChevronRight } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const me = user!;

  const { data, loading, error, reload } = useAsync(async () => {
    const [groups, friends, activity] = await Promise.all([
      db.listGroups(me.id),
      db.listFriendDirectGroups(me.id),
      db.listActivity(me.id)
    ]);
    return { groups, friends, activity };
  }, [me.id]);

  const all = [...(data?.groups ?? []), ...(data?.friends ?? [])];
  const owed = all.filter((g) => g.netCents > 0).reduce((a, g) => a + g.netCents, 0);
  const owe = all.filter((g) => g.netCents < 0).reduce((a, g) => a - g.netCents, 0);

  return (
    <AppShell header={<Header title={`Hi, ${me.full_name.split(' ')[0]}`} right={
      <Button variant="soft" className="h-10 px-3" onClick={() => nav('/add')}><Plus className="h-4 w-4" /> Add</Button>
    } />}>
      {loading ? (
        <Spinner label="Loading your balances…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-owed-wash p-4">
              <p className="text-[12.5px] font-medium text-owed">You are owed</p>
              <p className="tabular mt-1 font-display text-[22px] font-bold text-owed">{fromCents(owed, me.preferred_currency)}</p>
            </div>
            <div className="rounded-2xl bg-owe-wash p-4">
              <p className="text-[12.5px] font-medium text-owe">You owe</p>
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
                    <p className="text-[13px] text-ink-muted">{netLabel(netCents, me.preferred_currency)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-ink-muted" />
                </button>
              ))}
            </div>
          )}

          <h2 className="mb-2 mt-6 font-display text-[15px] font-semibold text-ink-soft">Recent activity</h2>
          {data!.activity.length === 0 ? (
            <p className="px-1 text-[14px] text-ink-muted">Nothing yet.</p>
          ) : (
            <div className="space-y-2">
              {data!.activity.slice(0, 8).map((a) => (
                <div key={a.id} className="rounded-xl bg-card px-4 py-3 text-[14px] text-ink-soft shadow-card">
                  {a.type === 'expense_added' && <>New expense · <b>{String(a.metadata.description ?? 'Expense')}</b> · {fromCents(Number(a.metadata.amount_cents ?? 0), me.preferred_currency)}</>}
                  {a.type === 'settlement' && <>Payment of {fromCents(Number(a.metadata.amount_cents ?? 0), me.preferred_currency)} recorded</>}
                  {!['expense_added', 'settlement'].includes(a.type) && <>{a.type.replace(/_/g, ' ')}</>}
                  <span className="ml-1 text-ink-muted">· {new Date(a.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function netLabel(net: number, currency: string) {
  if (net > 0) return `owes you ${fromCents(net, currency)}`;
  if (net < 0) return `you owe ${fromCents(-net, currency)}`;
  return 'all settled up';
}
