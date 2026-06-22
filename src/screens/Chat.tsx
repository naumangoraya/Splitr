import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { db } from '@/data/db';
import { supabase, isConfigured } from '@/lib/supabase';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner, ErrorState, Avatar, Sheet, Button } from '@/components/ui';
import { fromCents } from '@/lib/money';
import type { ChatMessage } from '@/types';
import { ChevronLeft, Send, Receipt, Paperclip } from 'lucide-react';

export default function Chat() {
  const { id } = useParams();
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();

  const group = useAsync(() => db.getGroup(id!), [id]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionId, setMentionId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setMessages(await db.listMessages(id)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load chat'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // realtime: append new messages live
  useEffect(() => {
    if (!id || !isConfigured || !supabase) return;
    const channel = supabase
      .channel(`messages:${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${id}` },
        () => { load(); })
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [id, load]);

  // autoscroll the message list (not the page) to newest
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  async function send() {
    const body = text.trim();
    if ((!body && !mentionId) || sending || !id) return;
    setSending(true);
    try {
      await db.sendMessage(me.id, id, body || '📎 expense', mentionId);
      setText('');
      setMentionId(null);
      if (!isConfigured) load(); // demo mode has no realtime
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  }

  const title = group.data
    ? (group.data.group.is_direct
        ? (group.data.members.find((m) => m.id !== me.id)?.full_name ?? 'Chat')
        : group.data.group.name)
    : 'Chat';
  const expenses = group.data?.expenses ?? [];

  return (
    <AppShell
      flush
      header={
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-canvas/90 px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <button className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl -ml-1" onClick={() => nav(-1)}><ChevronLeft className="h-6 w-6 text-ink-soft" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[17px] font-bold text-ink">{title}</h1>
            <p className="text-[12px] text-ink-muted">{group.data?.group.is_direct ? 'Direct chat' : `${group.data?.members.length ?? 0} members`}</p>
          </div>
        </header>
      }
    >
      {loading ? (
        <Spinner />
      ) : error && messages.length === 0 ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="flex h-full flex-col overflow-hidden">
          <div className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <p className="py-10 text-center text-[14px] text-ink-muted">No messages yet. Say hi 👋</p>
            )}
            {messages.map((m) => {
              const mine = m.user_id === me.id;
              return (
                <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  {!mine && <Avatar id={m.user_id} name={m.senderName} size={26} />}
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${mine ? 'bg-brand text-white' : 'bg-card text-ink shadow-card'}`}>
                    {!mine && <p className="mb-0.5 text-[11px] font-semibold opacity-70">{m.senderName}</p>}
                    {m.mention && (
                      <button onClick={() => nav(`/group/${m.group_id}`)}
                        className={`tap mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left ${mine ? 'bg-white/15' : 'bg-brand-wash'}`}>
                        <Receipt className={`h-4 w-4 flex-none ${mine ? 'text-white' : 'text-brand'}`} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{m.mention.description}</span>
                        <span className="text-[12.5px] font-semibold">{fromCents(m.mention.amountCents, m.mention.currency)}</span>
                      </button>
                    )}
                    {m.body && m.body !== '📎 expense' && <p className="whitespace-pre-wrap break-words text-[14px]">{m.body}</p>}
                    <p className={`mt-0.5 text-[10px] ${mine ? 'text-white/60' : 'text-ink-muted'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* composer */}
          <div className="sticky bottom-0 border-t border-line bg-canvas/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
            {mentionId && (
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-brand-wash px-3 py-1.5 text-[12.5px] text-brand">
                <Receipt className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate">{expenses.find((e) => e.id === mentionId)?.description ?? 'Expense'}</span>
                <button className="tap font-semibold" onClick={() => setMentionId(null)}>✕</button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button onClick={() => setMentionOpen(true)} disabled={expenses.length === 0}
                className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl text-ink-muted disabled:opacity-30" aria-label="Mention a transaction">
                <Paperclip className="h-5 w-5" />
              </button>
              <textarea
                value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Message…"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-brand"
              />
              <button onClick={send} disabled={sending || (!text.trim() && !mentionId)}
                className="tap flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="Send">
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* mention a transaction */}
      <Sheet open={mentionOpen} onClose={() => setMentionOpen(false)} title="Mention a transaction">
        <div className="max-h-[60vh] overflow-y-auto">
          {expenses.length === 0 ? (
            <p className="py-4 text-[13px] text-ink-muted">No expenses in this group yet.</p>
          ) : expenses.map((e, i) => (
            <button key={e.id} onClick={() => { setMentionId(e.id); setMentionOpen(false); }}
              className={`tap flex w-full items-center gap-3 px-1 py-3 text-left ${i > 0 ? 'border-t border-line' : ''}`}>
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-brand-wash text-[10px] font-semibold uppercase text-brand">{e.category.slice(0, 3)}</div>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{e.description}</span>
              <span className="tabular text-[13px] font-semibold text-ink-soft">{fromCents(e.amount_cents, e.currency)}</span>
            </button>
          ))}
        </div>
        <Button full variant="soft" className="mt-3" onClick={() => setMentionOpen(false)}>Cancel</Button>
      </Sheet>
    </AppShell>
  );
}
