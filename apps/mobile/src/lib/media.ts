import * as ImagePicker from 'expo-image-picker';

import { isDemo, supabase } from '@/lib/supabase';

export type PhotoSource = 'library' | 'camera';

/**
 * Choisit (ou prend) une photo, recadrée par l'utilisateur. Renvoie l'adresse locale, ou null si annulé.
 * `denied` si l'accès aux photos / à l'appareil photo est refusé.
 */
export async function pickPhoto(source: PhotoSource, aspect: [number, number]): Promise<string | null | 'denied'> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.6 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  return res.assets[0].uri;
}

/**
 * Envoie la photo dans le dossier de l'utilisateur et renvoie son adresse publique.
 * En mode démo, la photo reste sur le téléphone (adresse locale).
 */
export async function uploadPhoto(localUri: string, name: string): Promise<string> {
  if (isDemo || !supabase) return localUri;
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('not_signed_in');
  const body = await (await fetch(localUri)).arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) throw new Error('too_big');
  const path = `${data.user.id}/${name}.jpg`;
  const { error } = await supabase.storage.from('media').upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  // Paramètre de version : la nouvelle photo s'affiche tout de suite malgré les caches.
  return `${supabase.storage.from('media').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

export async function saveAvatarUrl(url: string | null) {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('not_signed_in');
  const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', data.user.id);
  if (error) throw error;
}
