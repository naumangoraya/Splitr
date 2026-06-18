import { useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { Button, Input } from '@/components/ui';
import { Split } from 'lucide-react';

export default function Auth() {
  const { signIn, signUp, exploreDemo, configured } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    const err = mode === 'in' ? await signIn(email, password) : await signUp(name, email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="min-h-screen bg-[#0f1020]">
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center bg-gradient-to-b from-[#1a1b35] to-[#0f1020] px-6 text-white">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand shadow-card">
            <Split className="h-8 w-8" />
          </div>
          <h1 className="font-display text-[30px] font-bold">Splitr</h1>
          <p className="mt-1 text-[15px] text-white/60">Split bills. Settle up. Stay friends.</p>
        </div>

        <div className="rounded-2xl bg-canvas p-5 text-ink shadow-card">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
            {(['in', 'up'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={`tap h-9 rounded-lg text-[14px] font-semibold ${
                  mode === m ? 'bg-card text-ink shadow-sm' : 'text-ink-muted'
                }`}
              >
                {m === 'in' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {mode === 'up' && (
              <Input label="Name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            )}
            <Input label="Email" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-[13px] text-owe">{error}</p>}
            <Button full onClick={submit} disabled={busy || !email || !password || (mode === 'up' && !name)}>
              {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}
            </Button>
          </div>

          {!configured && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-center text-[12.5px] text-ink-muted">
                No backend connected yet. Look around with sample data:
              </p>
              <Button full variant="soft" onClick={exploreDemo}>Explore demo</Button>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-[12px] text-white/40">Amounts in PKR · your data stays in your Supabase project</p>
      </div>
    </div>
  );
}
