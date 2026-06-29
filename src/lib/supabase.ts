import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

// Where the auth session is kept between launches.
// On the web that's localStorage. In the Android WebView, localStorage is NOT
// reliably persisted once the OS kills the app process — so the user looked
// logged out on every cold start. @capacitor/preferences writes to native
// storage that survives process death, which keeps the session sticky.
const nativeStorage = {
  getItem: async (key: string) => (await Preferences.get({ key })).value,
  setItem: async (key: string, value: string) => { await Preferences.set({ key, value }); },
  removeItem: async (key: string) => { await Preferences.remove({ key }); }
};

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // native app: no magic-link/URL sessions to parse
        storage: Capacitor.isNativePlatform() ? nativeStorage : window.localStorage,
        // Single WebView, no multi-tab — skip the Web Locks API. On an Android
        // WebView a lock taken before backgrounding can stay held on resume,
        // which deadlocks getSession()/token refresh and hangs the app forever
        // on the splash. A pass-through lock avoids that without any downside here.
        lock: <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn()
      }
    })
  : null;
