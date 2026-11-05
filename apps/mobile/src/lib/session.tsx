import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { loadProfile, profileComplete, type Profile } from '@/lib/auth';
import { importProviderAvatar } from '@/lib/media';
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

  // Dernier état sûr : une erreur passagère (réseau) ne doit jamais renvoyer vers l'écran de connexion,
  // car cela démonte toute la navigation (et l'écran en cours repartirait de zéro).
  const known = useRef<{ userId: string; profile: Profile } | null>(null);

  const reload = useCallback(async () => {
    if (!supabase) return;
    let session;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      session = data.session;
    } catch {
      return; // on garde l'état actuel
    }
    // Les anciennes sessions invitées (versions précédentes) doivent maintenant créer un vrai compte.
    if (!session || session.user.is_anonymous) {
      known.current = null;
      setProfile(null);
      setStatus('signedOut');
      return;
    }
    let p: Profile | null;
    try {
      p = await loadProfile();
    } catch {
      if (known.current?.userId === session.user.id) return; // profil déjà connu : on ne change rien
      p = null;
    }
    if (p) known.current = { userId: session.user.id, profile: p };
    setProfile(p);
    setStatus(profileComplete(p) ? 'ready' : 'incomplete');
    // Première connexion avec Google : on reprend sa photo de profil.
    if (p && !p.avatarUrl) {
      importProviderAvatar()
        .then((ok) => (ok ? loadProfile().then((q) => q && setProfile(q)) : undefined))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    reload();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // « SIGNED_IN » est aussi émis quand la session est simplement rafraîchie : on ne recharge
      // que si l'utilisateur a vraiment changé.
      if (event === 'SIGNED_IN' && session && known.current?.userId === session.user.id) return;
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
