import { useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { Button, Input } from '@/components/ui';
import { EidosyneWordmark } from '@/components/layout/EidosyneLogo';
import { Split, Eye, EyeOff } from 'lucide-react';

export default function Auth() {
  const { signIn, signUp, exploreDemo, configured } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (mode === 'up') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
    }
    setBusy(true);
    const err = mode === 'in' ? await signIn(email, password) : await signUp(name, email, password);
    setBusy(false);
    if (err) setError(err);
  }

  const canSubmit = !busy && Boolean(email) && Boolean(password) &&
    (mode === 'in' || (Boolean(name) && Boolean(confirm)));

  return (
    <div className="h-app overflow-y-auto bg-eidosyne-ink">
      <div className="mx-auto flex min-h-app max-w-[480px] flex-col justify-center bg-gradient-to-b from-[#15171c] to-eidosyne-ink px-6 py-8 text-white">
        {/* Eidosyne company branding */}
        <div className="mb-8 flex justify-center">
          <EidosyneWordmark tagline />
        </div>

        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand shadow-card">
            <Split className="h-7 w-7" />
          </div>
          <h1 className="font-display text-[26px] font-bold">Splitr</h1>
          <p className="mt-1 text-[14px] text-white/55">Split bills. Settle up. Stay friends.</p>
        </div>

        <div className="rounded-2xl bg-canvas p-5 text-ink shadow-card">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
            {(['in', 'up'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setConfirm(''); }}
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

            <div className="relative">
              <Input label="Password" type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                className="pr-11" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="tap absolute right-1 top-[26px] flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted">
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {mode === 'up' && (
              <Input label="Confirm password" type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                error={confirm && confirm !== password ? 'Passwords do not match' : undefined} />
            )}

            {error && <p className="text-[13px] text-owe">{error}</p>}
            <Button full onClick={submit} disabled={!canSubmit}>
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
        <p className="mt-6 text-center text-[12px] text-white/40">Amounts in PKR</p>
      </div>
    </div>
  );
}
