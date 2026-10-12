import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';
import { getSupabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { language, setLanguage } = useI18n();
  // loading | signed_out | signed_in | unavailable
  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const languageRef = useRef(language);
  languageRef.current = language;

  const loadProfile = useCallback(async () => {
    const me = await api('/api/me');
    setProfile(me);
    if (me.language && me.language !== languageRef.current) setLanguage(me.language);
    return me;
  }, [setLanguage]);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    const handleInvalidSession = () => {
      if (!cancelled) {
        setSession(null);
        setProfile(null);
        setStatus('signed_out');
      }
    };
    window.addEventListener('saheli-auth-invalid', handleInvalidSession);

    (async () => {
      let supabase;
      try {
        supabase = await getSupabase();
      } catch (error) {
        console.error('[SAHELI] Supabase authentication initialization failed.', {
          code: error?.code || 'supabase_init_failed',
          message: error?.message || 'unknown',
        });
        if (!cancelled) setStatus('unavailable');
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? 'signed_in' : 'signed_out');

      const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
        if (event === 'PASSWORD_RECOVERY') setRecovering(true);
        setSession(next);
        setStatus(next ? 'signed_in' : 'signed_out');
        if (!next) setProfile(null);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('saheli-auth-invalid', handleInvalidSession);
    };
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    loadProfile().catch(() => setProfile(null));
  }, [userId, loadProfile]);

  const signUp = useCallback(async (email, password, redirectTo) => {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async (everywhere = false) => {
    const supabase = await getSupabase();
    await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' });
    try {
      sessionStorage.clear(); // companion chat and other per-tab state
    } catch {
      // ignore
    }
  }, []);

  const sendReset = useCallback(async (email) => {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password) => {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecovering(false);
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const me = await api('/api/me', { method: 'PATCH', body: patch });
    setProfile(me);
    if (patch.language) setLanguage(patch.language);
    return me;
  }, [setLanguage]);

  const value = useMemo(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      profile,
      isMinor: profile?.age_group === 'under_13' || profile?.age_group === '13_17',
      recovering,
      signUp,
      signIn,
      signOut,
      sendReset,
      updatePassword,
      updateProfile,
      reloadProfile: loadProfile,
    }),
    [status, session, profile, recovering, signUp, signIn, signOut, sendReset, updatePassword, updateProfile, loadProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
