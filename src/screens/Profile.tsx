import { useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { db } from '@/data/db';
import { AppShell, Header } from '@/components/layout/AppShell';
import { Avatar, Button, Input } from '@/components/ui';
import { PoweredByEidosyne } from '@/components/layout/EidosyneLogo';
import { LogOut, Check } from 'lucide-react';

const CURRENCIES = ['PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR', 'INR'];

export default function Profile() {
  const { user, signOut, refresh, configured } = useAuth();
  const me = user!;
  const [name, setName] = useState(me.full_name);
  const [currency, setCurrency] = useState(me.preferred_currency);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await db.updateProfile(me.id, { full_name: name.trim(), preferred_currency: currency });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell header={<Header title="Profile" />}>
      <div className="px-5 py-4">
        <div className="mb-6 flex items-center gap-4">
          <Avatar id={me.id} name={me.full_name} size={64} url={me.avatar_url} />
          <div>
            <p className="font-display text-[18px] font-bold text-ink">{me.full_name}</p>
            <p className="text-[14px] text-ink-muted">{me.email}</p>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl bg-card p-4 shadow-card">
          <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Preferred currency</span>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((c) => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`tap rounded-xl px-3.5 py-2 text-[14px] font-semibold ${
                    currency === c ? 'bg-brand text-white' : 'bg-brand-wash text-brand'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-[13px] text-owe">{error}</p>}
          <Button full onClick={save} disabled={busy}>
            {saved ? <><Check className="h-4 w-4" /> Saved</> : busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>

        {!configured && (
          <p className="mt-4 rounded-xl bg-brand-wash px-4 py-3 text-[13px] text-brand">
            Demo mode — changes aren’t persisted. Connect your Supabase project to go live.
          </p>
        )}

        <Button variant="ghost" full className="mt-6 text-owe" onClick={signOut}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>

        <PoweredByEidosyne className="mt-8" />
      </div>
    </AppShell>
  );
}
