import { useState } from 'react';
import type { Member } from '@/types';
import { db } from '@/data/db';
import { Button, Input, Sheet, Avatar } from '@/components/ui';
import { fromCents, toCents } from '@/lib/money';
import type { Transfer } from '@/lib/debt';

export function SettleUpSheet({
  open,
  onClose,
  groupId,
  currency,
  members,
  meId,
  suggested,
  onDone
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  currency: string;
  members: Member[];
  meId: string;
  suggested: Transfer | null;
  onDone: () => void;
}) {
  const [from, setFrom] = useState(suggested?.fromUser ?? meId);
  const [to, setTo] = useState(suggested?.toUser ?? '');
  const [amount, setAmount] = useState(suggested ? (suggested.amountCents / 100).toString() : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = toCents(amount) ?? 0;
  const valid = from && to && from !== to && cents > 0;

  const payload = () => ({
    group_id: groupId, from_user: from, to_user: to,
    amount_cents: cents, currency, note: null, created_by: meId
  });

  async function record() {
    if (!valid || busy) return; // idempotency: ignore double taps
    setBusy(true);
    setError(null);
    try {
      await db.addSettlement(payload());
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the payment');
    } finally {
      setBusy(false);
    }
  }

  async function request() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await db.requestSettlement(payload());
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  }

  const name = (id: string) => members.find((m) => m.id === id)?.full_name ?? '—';

  return (
    <Sheet open={open} onClose={onClose} title="Record a payment">
      <div className="space-y-4">
        <Picker label="From (pays)" members={members} value={from} onChange={setFrom} meId={meId} />
        <Picker label="To (receives)" members={members} value={to} onChange={setTo} meId={meId} exclude={from} />
        <Input label={`Amount (${currency})`} inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {from && to && from !== to && cents > 0 && (
          <p className="text-[13.5px] text-ink-soft">
            <b>{name(from)}</b> pays <b>{name(to)}</b> {fromCents(cents, currency)}
          </p>
        )}
        {error && <p className="text-[13px] text-owe">{error}</p>}
        {/* Primary: request — stays amber until the person who is owed confirms receipt. */}
        <Button full onClick={request} disabled={!valid || busy}>{busy ? 'Sending…' : 'Request settle-up'}</Button>
        <Button full variant="soft" onClick={record} disabled={!valid || busy}>
          {busy ? 'Recording…' : 'Record as already confirmed'}
        </Button>
        <p className="text-[12px] text-ink-muted">
          “Request settle-up” marks it pending (amber) until {to ? name(to) : 'the person owed'} confirms they got the money. “Record as already confirmed” settles it immediately — use it if you’re the one who received the payment.
        </p>
      </div>
    </Sheet>
  );
}

function Picker({
  label, members, value, onChange, meId, exclude
}: {
  label: string; members: Member[]; value: string; onChange: (v: string) => void; meId: string; exclude?: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      <div className="flex flex-wrap gap-2">
        {members.filter((m) => m.id !== exclude).map((m) => (
          <button key={m.id} onClick={() => onChange(m.id)}
            className={`tap flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-3 ${value === m.id ? 'bg-brand text-white' : 'bg-card text-ink-soft shadow-card'}`}>
            <Avatar id={m.id} name={m.full_name} size={24} />
            <span className="text-[13px] font-medium">{m.id === meId ? 'You' : m.full_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
