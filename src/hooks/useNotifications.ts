import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase, isConfigured } from '@/lib/supabase';
import { db } from '@/data/db';
import type { AppNotification } from '@/types';

/**
 * Loads the user's notifications and subscribes to new ones in realtime.
 * On a new notification it fires a system-tray local notification (native).
 *
 * Chat alerts (type 'message') are kept separate from "general" alerts
 * (expense/settlement): the bell shows general only; the chat icon shows the
 * unread message count. So we expose both streams and counts.
 */
export function useNotifications(userId: string | undefined) {
  const [items, setItems] = useState<AppNotification[]>([]);

  const reload = useCallback(async () => {
    if (!userId) return;
    try { setItems(await db.listNotifications(userId)); } catch { /* ignore */ }
  }, [userId]);

  const markGeneralRead = useCallback(async () => {
    if (!userId) return;
    try {
      await db.markNotificationsRead(userId, 'general');
      const now = new Date().toISOString();
      setItems((cur) => cur.map((n) => (n.type !== 'message' && !n.read_at ? { ...n, read_at: now } : n)));
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  // realtime: only when connected to Supabase
  useEffect(() => {
    if (!userId || !isConfigured || !supabase) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as AppNotification;
          setItems((cur) => [n, ...cur]);
          fireLocalNotification(n.body);
        })
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [userId]);

  const general = items.filter((n) => n.type !== 'message');
  const generalUnread = general.filter((n) => !n.read_at).length;
  const messageUnread = items.filter((n) => n.type === 'message' && !n.read_at).length;
  return { items, general, generalUnread, messageUnread, reload, markGeneralRead };
}

// Fire a system-tray notification on native; no-op on web.
async function fireLocalNotification(body: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 1_000_000),
        title: 'Splitr',
        body
      }]
    });
  } catch { /* local notifications unavailable — ignore */ }
}
