import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell, Header } from '@/components/layout/AppShell';
import { Avatar, Spinner, ErrorState, EmptyState } from '@/components/ui';
import { fromCents } from '@/lib/money';
import { ChevronRight } from 'lucide-react';

export default function Friends() {
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();
  const { data, loading, error, reload } = useAsync(() => db.listFriendDirectGroups(me.id), [me.id]);

  return (
    <AppShell header={<Header title="Friends" />}>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data!.length === 0 ? (
        <EmptyState title="No friends yet" body="One-to-one balances with friends show up here. Add a shared expense to start." />
      ) : (
        <div className="px-5 py-4">
          <div className="overflow-hidden rounded-2xl bg-card shadow-card">
            {data!.map(({ group, netCents }, i) => (
              <button key={group.id} onClick={() => nav(`/group/${group.id}`)}
                className={`tap flex w-full items-center gap-3 px-4 py-3.5 text-left ${i > 0 ? 'border-t border-line' : ''}`}>
                <Avatar id={group.id} name={group.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{group.name}</p>
                  <p className="text-[13px] text-ink-muted">
                    {netCents > 0 ? 'owes you' : netCents < 0 ? 'you owe' : 'all settled'}
                  </p>
                </div>
                <p className={`tabular text-[15px] font-semibold ${netCents > 0 ? 'text-owed' : netCents < 0 ? 'text-owe' : 'text-ink-muted'}`}>
                  {netCents === 0 ? '—' : fromCents(Math.abs(netCents), me.preferred_currency)}
                </p>
                <ChevronRight className="h-5 w-5 text-ink-muted" />
              </button>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
