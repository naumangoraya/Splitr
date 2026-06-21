import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase, isConfigured } from '@/lib/supabase';

// last FCM token for this device, so we can delete it on sign-out
let lastToken: string | null = null;

/**
 * Registers the device for FCM background push and saves its token to
 * device_tokens. No-ops on web, in demo mode, or if Firebase isn't configured
 * (so the app works fine before/without FCM setup). Tapping a push that carries
 * a groupId navigates there.
 *
 * @param userId  current signed-in user, or undefined when logged out
 * @param onOpenGroup  called with a groupId when the user taps a push
 */
export function usePush(userId: string | undefined, onOpenGroup?: (groupId: string) => void) {
  useEffect(() => {
    if (!userId || !isConfigured || !supabase || !Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        const perm = await PushNotifications.checkPermissions();
        let status = perm.receive;
        if (status === 'prompt' || status === 'prompt-with-rationale') {
          status = (await PushNotifications.requestPermissions()).receive;
        }
        if (status !== 'granted' || cancelled) return;

        const onReg = await PushNotifications.addListener('registration', async (token) => {
          lastToken = token.value;
          // upsert this device's token for the current user
          try {
            await supabase!.from('device_tokens').upsert(
              { token: token.value, user_id: userId, platform: Capacitor.getPlatform(), updated_at: new Date().toISOString() },
              { onConflict: 'token' }
            );
          } catch { /* ignore */ }
        });

        const onTap = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const gid = action.notification.data?.groupId;
          if (gid && onOpenGroup) onOpenGroup(String(gid));
        });

        await PushNotifications.register();

        cleanup = () => { onReg.remove(); onTap.remove(); };
      } catch { /* push unavailable (no Firebase / old device) — ignore */ }
    })();

    return () => { cancelled = true; cleanup?.(); };
  }, [userId, onOpenGroup]);
}

/** Remove this device's token on sign-out so it stops receiving the user's push. */
export async function unregisterPushToken() {
  if (!isConfigured || !supabase || !Capacitor.isNativePlatform()) return;
  try {
    if (lastToken) await supabase.from('device_tokens').delete().eq('token', lastToken);
    lastToken = null;
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners();
  } catch { /* ignore */ }
}
