import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell, Header } from '@/components/layout/AppShell';
import { Avatar, Spinner, ErrorState, EmptyState, Button, Input, Sheet } from '@/components/ui';
import { fromCents } from '@/lib/money';
import { ChevronRight, ChevronDown, UserPlus, UserMinus, MessageCircle } from 'lucide-react';

export default function Friends() {
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();
  const { data, loading, error, reload } = useAsync(() => db.listFriendDirectGroups(me.id), [me.id]);
  const people = useAsync(() => db.listPeopleBalances(me.id), [me.id]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState<string | null>(null);

  // open (or create on first use) the 1-1 chat with this person
  async function chatWith(personId: string, email: string) {
    setRowError(null);
    setChatBusy(personId);
    try {
      const gid = await db.addFriendByEmail(me.id, email);
      nav(`/group/${gid}/chat`);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not open the chat');
      setChatBusy(null);
    }
  }

  async function removeFriend(groupId: string, name: string, settled: boolean) {
    setRowError(null);
    if (!settled) {
      setRowError(`Settle up with ${name} before removing them.`);
      return;
    }
    if (!confirm(`Remove ${name}? This deletes your shared expense history with them.`)) return;
    setRemovingId(groupId);
    try {
      await db.removeFriend(me.id, groupId);
      reload();
      people.reload();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not remove that friend');
    } finally {
      setRemovingId(null);
    }
  }

  async function addFriend() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setAddError(null);
    try {
      const groupId = await db.addFriendByEmail(me.id, email.trim());
      setOpen(false);
      setEmail('');
      nav(`/group/${groupId}`);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add that friend');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell header={<Header title="Friends" right={
      <Button variant="soft" className="h-10 px-3" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Add</Button>
    } />}>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data!.length === 0 && (people.data ?? []).length === 0 ? (
        <EmptyState title="No friends yet" body="Add a friend by their email to start sharing one-to-one expenses."
          action={<Button onClick={() => setOpen(true)}>Add a friend</Button>} />
      ) : (
        <div className="space-y-6 px-5 py-4">
          {rowError && <p className="text-[13px] text-owe">{rowError}</p>}

          {/* Cumulative balance with each person across ALL groups + direct */}
          {(people.data ?? []).length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-soft">Balances with people</p>
              <div className="overflow-hidden rounded-2xl bg-card shadow-card">
                {people.data!.map((pb, i) => {
                  const net = pb.totalNetCents;
                  const isOpen = expanded === pb.person.id;
                  return (
                    <div key={pb.person.id} className={i > 0 ? 'border-t border-line' : ''}>
                      <div className="flex items-center">
                        <button onClick={() => setExpanded(isOpen ? null : pb.person.id)}
                          className="tap flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 text-left">
                          <Avatar id={pb.person.id} name={pb.person.full_name || pb.person.email} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink">{pb.person.full_name || pb.person.email}</p>
                            <p className="text-[13px] text-ink-muted">
                              {net > 0 ? 'owes you in total' : net < 0 ? 'you owe in total' : 'all settled'}
                              {pb.breakdown.length > 1 ? ` · ${pb.breakdown.length} groups` : ''}
                            </p>
                          </div>
                          <p className={`tabular text-[15px] font-semibold ${net > 0 ? 'text-owed' : net < 0 ? 'text-owe' : 'text-ink-muted'}`}>
                            {net === 0 ? '—' : fromCents(Math.abs(net), me.preferred_currency)}
                          </p>
                          <ChevronDown className={`h-5 w-5 flex-none text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <button onClick={() => chatWith(pb.person.id, pb.person.email)} disabled={chatBusy === pb.person.id}
                          aria-label={`Chat with ${pb.person.full_name || pb.person.email}`}
                          className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl text-ink-soft disabled:opacity-40">
                          <MessageCircle className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                      {isOpen && (
                        <div className="bg-canvas px-4 pb-3">
                          {pb.breakdown.map(({ group, netCents }) => (
                            <button key={group.id} onClick={() => nav(`/group/${group.id}`)}
                              className="tap flex w-full items-center gap-2 py-2 text-left">
                              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-soft">
                                {group.is_direct ? 'Direct' : group.name}
                              </span>
                              <span className={`tabular text-[13.5px] font-medium ${netCents > 0 ? 'text-owed' : 'text-owe'}`}>
                                {netCents > 0 ? '+' : '-'}{fromCents(Math.abs(netCents), me.preferred_currency)}
                              </span>
                              <ChevronRight className="h-4 w-4 flex-none text-ink-muted" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Direct (one-to-one) friends, with add/remove */}
          {data!.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-soft">Direct friends</p>
              <div className="overflow-hidden rounded-2xl bg-card shadow-card">
                {data!.map(({ group, netCents }, i) => (
                  <div key={group.id} className={`flex items-center ${i > 0 ? 'border-t border-line' : ''}`}>
                    <button onClick={() => nav(`/group/${group.id}`)}
                      className="tap flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 text-left">
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
                      <ChevronRight className="h-5 w-5 flex-none text-ink-muted" />
                    </button>
                    <button onClick={() => nav(`/group/${group.id}/chat`)} aria-label={`Chat with ${group.name}`}
                      className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl text-ink-soft">
                      <MessageCircle className="h-[18px] w-[18px]" />
                    </button>
                    <button onClick={() => removeFriend(group.id, group.name, netCents === 0)}
                      disabled={removingId === group.id} aria-label={`Remove ${group.name}`}
                      className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl text-ink-muted disabled:opacity-40">
                      <UserMinus className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Sheet open={open} onClose={() => { setOpen(false); setAddError(null); }} title="Add a friend">
        <div className="space-y-3">
          <Input label="Their email" type="email" placeholder="friend@email.com" value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="They need a Splitr account already. We’ll open your shared balance." />
          {addError && <p className="text-[13px] text-owe">{addError}</p>}
          <Button full onClick={addFriend} disabled={!email.trim() || busy}>{busy ? 'Adding…' : 'Add friend'}</Button>
        </div>
      </Sheet>
    </AppShell>
  );
}
