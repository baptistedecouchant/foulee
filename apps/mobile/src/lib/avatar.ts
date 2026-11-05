import { useState } from 'react';

import { pickPhoto, saveAvatarUrl, uploadPhoto, type PhotoSource } from '@/lib/media';
import { useSession } from '@/lib/session';
import { useStore } from '@/lib/store';
import { isDemo } from '@/lib/supabase';

/** Ma photo de profil : lecture, changement (galerie ou appareil photo), suppression. */
export function useMyAvatar() {
  const { profile, reload } = useSession();
  const { localAvatar, setLocalAvatar } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uri = isDemo ? (localAvatar ?? null) : (profile?.avatarUrl ?? null);

  const change = async (source: PhotoSource) => {
    setError(null);
    const local = await pickPhoto(source, [1, 1]).catch(() => null);
    if (local === 'denied') {
      setError(source === 'camera' ? 'Autorise l’appareil photo dans les réglages du téléphone.' : 'Autorise l’accès aux photos dans les réglages du téléphone.');
      return;
    }
    if (!local) return;
    setBusy(true);
    try {
      if (isDemo) setLocalAvatar(local);
      else {
        await saveAvatarUrl(await uploadPhoto(local, 'avatar'));
        await reload();
      }
    } catch (e) {
      setError(String((e as Error)?.message) === 'too_big' ? 'Photo trop lourde (5 Mo maximum).' : 'La photo n’a pas pu être enregistrée. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null);
    if (isDemo) return setLocalAvatar(null);
    setBusy(true);
    try {
      await saveAvatarUrl(null);
      await reload();
    } catch {
      setError('La photo n’a pas pu être retirée. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  return { uri, change, remove, busy, error };
}
