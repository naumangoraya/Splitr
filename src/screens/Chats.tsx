import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { AppShell, Header } from '@/components/layout/AppShell';
import { Avatar, Spinner, ErrorState, EmptyState, Button, Input } from '@/components/ui';
import type { ChatPerson, Conversation } from '@/types';
import { Search, UserRound, Users } from 'lucide-react';

export default function Chats() {
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const [people, convos] = await Promise.all([db.listChatPeople(me.id), db.listConversations(me.id)]);
    return { people, groups: convos };
  }, [me.id]);

  const q = query.trim().toLowerCase();
  const people = (data?.people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  const groups = (data?.groups ?? []).filter((g) => !q || g.title.toLowerCase().includes(q));
  const nothing = (data?.people.length ?? 0) === 0 && (data?.groups.length ?? 0) === 0;

  async function openPerson(p: ChatPerson) {
    if (p.directGroupId) { nav(`/group/${p.directGroupId}/chat`); return; }
    setStarting(p.id);
    setStartError(null);
    try {
      const gid = await db.addFriendByEmail(me.id, p.email); // get-or-create the 1-1 group
      nav(`/group/${gid}/chat`);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Could not open the chat');
      setStarting(null);
    }
  }

  return (
    <AppShell header={<Header title="Chats" />}>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : nothing ? (
        <EmptyState title="No one to chat with yet" body="Add a friend or join a group, then you can message them here."
          action={<Button onClick={() => nav('/friends')}>Add a friend</Button>} />
      ) : (
        <div className="space-y-6 px-5 py-4">
          {/* search both people and group chats */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input className="pl-9" placeholder="Search people and chats…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {startError && <p className="text-[13px] text-owe">{startError}</p>}

          {/* People — tap to open (or start) a 1-on-1 chat */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-soft"><UserRound className="h-4 w-4" /> People</p>
            {people.length === 0 ? (
              <p className="px-1 text-[13px] text-ink-muted">{q ? 'No people match your search.' : 'No people yet — add a friend or join a group.'}</p>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-card shadow-card">
                {people.map((p, i) => (
                  <button key={p.id} onClick={() => openPerson(p)} disabled={starting === p.id}
                    className={`tap flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-50 ${i > 0 ? 'border-t border-line' : ''}`}>
                    <Avatar id={p.id} name={p.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{p.name}</p>
                      <p className={`truncate text-[13px] ${p.unread > 0 ? 'font-medium text-ink-soft' : 'text-ink-muted'}`}>
                        {starting === p.id ? 'Opening…' : personPreview(p)}
                      </p>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1">
                      {p.lastAt && <span className="text-[11px] text-ink-muted">{when(p.lastAt)}</span>}
                      {p.unread > 0 && <Badge n={p.unread} />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Group chats */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-soft"><Users className="h-4 w-4" /> Group chats</p>
            {groups.length === 0 ? (
              <p className="px-1 text-[13px] text-ink-muted">{q ? 'No groups match your search.' : 'Create a group to chat with everyone in it.'}</p>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-card shadow-card">
                {groups.map((c, i) => (
                  <button key={c.groupId} onClick={() => nav(`/group/${c.groupId}/chat`)}
                    className={`tap flex w-full items-center gap-3 px-4 py-3 text-left ${i > 0 ? 'border-t border-line' : ''}`}>
                    <Avatar id={c.avatarId} name={c.title} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{c.title}</p>
                      <p className={`truncate text-[13px] ${c.unread > 0 ? 'font-medium text-ink-soft' : 'text-ink-muted'}`}>{convoPreview(c)}</p>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1">
                      {c.lastAt && <span className="text-[11px] text-ink-muted">{when(c.lastAt)}</span>}
                      {c.unread > 0 && <Badge n={c.unread} />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
      {n > 9 ? '9+' : n}
    </span>
  );
}

function personPreview(p: ChatPerson): string {
  if (!p.lastMessage) return 'Tap to start chatting';
  return p.lastMessage === '📎 expense' ? '📎 Transaction' : p.lastMessage;
}

function convoPreview(c: Conversation): string {
  if (!c.lastMessage) return 'No messages yet';
  return c.lastMessage === '📎 expense' ? '📎 Transaction' : c.lastMessage;
}

function when(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString();
}
