import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { loadProfile, profileComplete, type Profile } from '@/lib/auth';
import { isDemo, supabase } from '@/lib/supabase';

export type SessionStatus = 'loading' | 'signedOut' | 'incomplete' | 'ready' | 'demo';

interface SessionStore {
  status: SessionStatus;
  profile: Profile | null;
  reload(): Promise<void>;
}

const Ctx = createContext<SessionStore | null>(null);

/** Suit la connexion de l'utilisateur et l'état de sa fiche (prénom, nom, naissance, consentements). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(isDemo ? 'demo' : 'loading');
  const [profile, setProfile] = useState<Profile | null>(null);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    // Les anciennes sessions invitées (versions précédentes) doivent maintenant créer un vrai compte.
    if (!data.session || data.session.user.is_anonymous) {
      setProfile(null);
      setStatus('signedOut');
      return;
    }
    const p = await loadProfile().catch(() => null);
    setProfile(p);
    setStatus(profileComplete(p) ? 'ready' : 'incomplete');
  }, []);

  useEffect(() => {
    if (!supabase) return;
    reload();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') reload();
    });
    return () => data.subscription.unsubscribe();
  }, [reload]);

  return <Ctx.Provider value={{ status, profile, reload }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession hors de SessionProvider');
  return s;
}
