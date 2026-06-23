import { type ReactNode } from 'react';
import { useOnline } from '@/hooks/useOnline';
import { WifiOff } from 'lucide-react';

// `flush` = no bottom padding and no outer scroll (for screens like Chat that
// manage their own fixed-height scroll area).
export function AppShell({ children, header, flush = false }: { children: ReactNode; header?: ReactNode; flush?: boolean }) {
  const online = useOnline();
  return (
    <div className="min-h-app bg-[#0f1020]">
      <div className="relative mx-auto flex h-app max-w-[480px] flex-col overflow-hidden bg-canvas">
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-ink px-4 py-1.5 text-[12.5px] font-medium text-white">
            <WifiOff className="h-3.5 w-3.5" /> You’re offline — showing the last loaded data
          </div>
        )}
        {header}
        <main className={`no-scrollbar min-h-0 flex-1 ${flush ? 'overflow-hidden' : 'overflow-y-auto pb-28'}`}>{children}</main>
      </div>
    </div>
  );
}

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-canvas/90 px-5 py-3.5 pt-[calc(0.875rem+env(safe-area-inset-top))] backdrop-blur">
      <h1 className="min-w-0 truncate font-display text-[20px] font-bold text-ink">{title}</h1>
      {right && <div className="flex-none">{right}</div>}
    </header>
  );
}
