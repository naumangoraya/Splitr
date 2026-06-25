import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase, isConfigured } from '@/lib/supabase';
import { db } from '@/data/db';
import { DEMO_ME_ID } from '@/data/demoData';
import { unregisterPushToken } from '@/hooks/usePush';
import type { Profile } from '@/types';

interface AuthState {
  user: Profile | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  exploreDemo: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(id: string) {
    const p = await db.getProfile(id);
    setUser(p);
  }

  useEffect(() => {
    let active = true;
    if (!isConfigured || !supabase) {
      setLoading(false);
      return;
    }
    // Safety net: never let the branded splash hang forever. If session/profile
    // resolution stalls (flaky network on resume, etc.), drop the splash anyway —
    // onAuthStateChange will fill in the user once it recovers.
    const failsafe = setTimeout(() => { if (active) setLoading(false); }, 5000);

    (async () => {
      try {
        const { data } = await supabase!.auth.getSession();
        if (active && data.session?.user) await loadProfile(data.session.user.id);
      } catch { /* ignore — failsafe + onAuthStateChange recover */ }
      finally { if (active) { clearTimeout(failsafe); setLoading(false); } }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user) await loadProfile(session.user.id);
      else setUser(null);
    });
    return () => {
      active = false;
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  // Native: pause token auto-refresh while backgrounded, and on resume restart it
  // and re-check the session. Prevents stale-token / stalled-refresh states that
  // used to leave the app hanging when reopened after a long time in the background.
  useEffect(() => {
    if (!isConfigured || !supabase || !Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!supabase) return;
        if (isActive) {
          supabase.auth.startAutoRefresh();
          supabase.auth.getSession()
            .then(({ data }) => { if (data.session?.user) loadProfile(data.session.user.id); })
            .catch(() => {});
        } else {
          supabase.auth.stopAutoRefresh();
        }
      });
      remove = () => handle.remove();
    })();
    return () => { remove?.(); };
  }, []);

  const signIn: AuthState['signIn'] = async (email, password) => {
    if (!supabase) return 'Backend not connected. Use “Explore demo” to look around.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const signUp: AuthState['signUp'] = async (name, email, password) => {
    if (!supabase) return 'Backend not connected. Use “Explore demo” to look around.';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });
    if (error) {
      // Friendlier copy for the common free-tier email rate limit.
      if (/rate limit|too many/i.test(error.message)) {
        return 'Too many signups from this project right now. Wait a minute and try again, or ask the owner to turn off email confirmation.';
      }
      return error.message;
    }
    // If email confirmation is ON, Supabase returns a user with no active session.
    // Tell the user instead of leaving them on a silent, logged-out screen.
    if (data.user && !data.session) {
      return 'Check your email to confirm your account, then sign in.';
    }
    return null;
  };

  const signOut = async () => {
    await unregisterPushToken();           // stop this device receiving the user's push
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  };

  const exploreDemo = async () => {
    await loadProfile(DEMO_ME_ID);
  };

  const refresh = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, configured: isConfigured, signIn, signUp, signOut, exploreDemo, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
