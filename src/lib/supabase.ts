import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // native app: no magic-link/URL sessions to parse
        // Single WebView, no multi-tab — skip the Web Locks API. On an Android
        // WebView a lock taken before backgrounding can stay held on resume,
        // which deadlocks getSession()/token refresh and hangs the app forever
        // on the splash. A pass-through lock avoids that without any downside here.
        lock: <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn()
      }
    })
  : null;
