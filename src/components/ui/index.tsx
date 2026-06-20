import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Loader2, Inbox, AlertCircle } from 'lucide-react';

const COLORS = ['#4338ca', '#0f9d6e', '#e11d48', '#d97706', '#7c3aed', '#0891b2'];
export function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({ name, id, size = 40, url }: { name: string; id: string; size?: number; url?: string | null }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  if (url) {
    return <img src={url} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="flex items-center justify-center rounded-full font-display font-semibold text-white"
      style={{ width: size, height: size, background: colorFor(id), fontSize: size * 0.4 }}
    >
      {initials || '?'}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'soft' | 'danger';
  full?: boolean;
};
export function Button({ variant = 'primary', full, className = '', children, ...rest }: ButtonProps) {
  const base = 'tap inline-flex items-center justify-center gap-2 rounded-xl px-4 h-12 font-semibold text-[15px] disabled:opacity-40 disabled:pointer-events-none';
  const styles = {
    primary: 'bg-brand text-white shadow-card',
    ghost: 'bg-transparent text-brand',
    soft: 'bg-brand-wash text-brand',
    danger: 'bg-owe text-white'
  }[variant];
  return (
    <button className={`${base} ${styles} ${full ? 'w-full' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string };
export function Input({ label, hint, error, className = '', ...rest }: InputProps) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>}
      <input
        className={`h-12 w-full rounded-xl border bg-white px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-brand ${
          error ? 'border-owe' : 'border-line'
        } ${className}`}
        {...rest}
      />
      {error ? (
        <span className="mt-1 block text-[12.5px] text-owe">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12.5px] text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}


export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-muted">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-wash">
        <Inbox className="h-7 w-7 text-brand" />
      </div>
      <h3 className="font-display text-[17px] font-semibold text-ink">{title}</h3>
      <p className="max-w-[15rem] text-[14px] text-ink-muted">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <AlertCircle className="h-8 w-8 text-owe" />
      <p className="text-[14px] text-ink-soft">{message}</p>
      {onRetry && <Button variant="soft" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-[480px] rounded-t-3xl bg-canvas p-5 shadow-sheet animate-[slideup_.2s_ease]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h2 className="mb-4 font-display text-[18px] font-semibold text-ink">{title}</h2>
        {children}
      </div>
      <style>{`@keyframes slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}
