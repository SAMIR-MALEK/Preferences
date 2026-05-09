import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { AuthUser, UserRole } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadUserProfile(userId: string) {
    try {
      const { data: adminData } = await supabase
        .from('admins')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (adminData) {
        setUser({ id: userId, role: 'admin' as UserRole, admin: adminData });
        setLoading(false);
        return;
      }

      const { data: profData } = await supabase
        .from('professors')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (profData) {
        setUser({ id: userId, role: 'professor' as UserRole, professor: profData });
        setLoading(false);
        return;
      }

      setUser(null);
      setLoading(false);
    } catch {
      setUser(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        loadUserProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(username: string, password: string) {
    try {
      const email = username.includes('@') ? username : `${username}@wishes.univ-bbm.dz`;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      return { error: null };
    } catch {
      return { error: 'خطأ في الاتصال بالخادم' };
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
