import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, isConfigured } from '@/lib/supabase';
import { db } from '@/data/db';
import { DEMO_ME_ID } from '@/data/demoData';
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
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user) await loadProfile(session.user.id);
      else setUser(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthState['signIn'] = async (email, password) => {
    if (!supabase) return 'Backend not connected. Use “Explore demo” to look around.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const signUp: AuthState['signUp'] = async (name, email, password) => {
    if (!supabase) return 'Backend not connected. Use “Explore demo” to look around.';
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });
    return error ? error.message : null;
  };

  const signOut = async () => {
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
