import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell, Header } from '@/components/layout/AppShell';
import { Avatar, Spinner, ErrorState, EmptyState, Button, Input, Sheet } from '@/components/ui';
import { fromCents } from '@/lib/money';
import { Plus, ChevronRight } from 'lucide-react';

export default function Groups() {
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(() => db.listGroups(me.id), [me.id]);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setCreateError(null);
    try {
      const id = await db.createGroup(me.id, name.trim(), desc.trim() || null, me.preferred_currency);
      setOpen(false);
      setName('');
      setDesc('');
      nav(`/group/${id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create the group');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell header={<Header title="Groups" right={
      <Button variant="soft" className="h-10 px-3" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New</Button>
    } />}>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data!.length === 0 ? (
        <EmptyState title="No groups yet" body="Groups hold shared expenses for trips, flats, or events." action={<Button onClick={() => setOpen(true)}>Create a group</Button>} />
      ) : (
        <div className="px-5 py-4">
          <div className="overflow-hidden rounded-2xl bg-card shadow-card">
            {data!.map(({ group, netCents }, i) => (
              <button key={group.id} onClick={() => nav(`/group/${group.id}`)}
                className={`tap flex w-full items-center gap-3 px-4 py-3.5 text-left ${i > 0 ? 'border-t border-line' : ''}`}>
                <Avatar id={group.id} name={group.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{group.name}</p>
                  {group.description && <p className="truncate text-[13px] text-ink-muted">{group.description}</p>}
                </div>
                <div className="text-right">
                  <p className={`tabular text-[14px] font-semibold ${netCents > 0 ? 'text-owed' : netCents < 0 ? 'text-owe' : 'text-ink-muted'}`}>
                    {netCents === 0 ? 'settled' : fromCents(Math.abs(netCents), me.preferred_currency)}
                  </p>
                  <p className="text-[11px] text-ink-muted">{netCents > 0 ? 'you’re owed' : netCents < 0 ? 'you owe' : ''}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-ink-muted" />
              </button>
            ))}
          </div>
        </div>
      )}

      <Sheet open={open} onClose={() => { setOpen(false); setCreateError(null); }} title="New group">
        <div className="space-y-3">
          <Input label="Group name" placeholder="e.g. Apartment 4B" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Description (optional)" placeholder="Rent, bills, groceries" value={desc} onChange={(e) => setDesc(e.target.value)} />
          {createError && <p className="text-[13px] text-owe">{createError}</p>}
          <Button full onClick={create} disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create group'}</Button>
        </div>
      </Sheet>
    </AppShell>
  );
}
