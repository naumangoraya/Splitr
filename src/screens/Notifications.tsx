import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useNotifications } from '@/hooks/useNotifications';
import { AppShell } from '@/components/layout/AppShell';
import { ChevronLeft, Bell } from 'lucide-react';

export default function Notifications() {
  const { user } = useAuth();
  const me = user!;
  const nav = useNavigate();
  const notif = useNotifications(me.id);

  // opening the full list clears the unread (general) badge
  useEffect(() => { notif.markGeneralRead(); }, [notif.markGeneralRead]);

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-canvas/90 px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <button className="tap flex h-11 w-11 flex-none items-center justify-center rounded-xl -ml-1" onClick={() => nav(-1)} aria-label="Back"><ChevronLeft className="h-6 w-6 text-ink-soft" /></button>
          <h1 className="flex-1 font-display text-[18px] font-bold text-ink">Notifications</h1>
        </header>
      }
    >
      <div className="px-5 py-4">
        {notif.general.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-ink-muted">No notifications yet.</p>
        ) : (
          <div className="space-y-2">
            {notif.general.map((n) => (
              <button key={n.id}
                onClick={() => { if (n.group_id) nav(`/group/${n.group_id}`); }}
                className="tap flex w-full items-start gap-3 rounded-xl bg-card px-3.5 py-3 text-left shadow-card">
                <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-wash text-brand">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-ink">{n.body}</p>
                  <p className="text-[11px] text-ink-muted">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
