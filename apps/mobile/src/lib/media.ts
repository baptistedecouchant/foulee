import * as ImagePicker from 'expo-image-picker';

import { isDemo, supabase } from '@/lib/supabase';

export type PhotoSource = 'library' | 'camera';

/**
 * Choisit (ou prend) une photo, recadrée par l'utilisateur. Renvoie l'adresse locale, ou null si annulé.
 * `denied` si l'accès aux photos / à l'appareil photo est refusé.
 */
export interface PickedPhoto {
  uri: string;
  /** Contenu de l'image (base64), lu directement par le sélecteur : plus fiable qu'une relecture du fichier. */
  base64?: string | null;
  mimeType?: string | null;
}

export async function pickPhoto(source: PhotoSource, aspect: [number, number]): Promise<PickedPhoto | null | 'denied'> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.5, base64: true };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, base64: a.base64, mimeType: a.mimeType };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]+,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (clean[i + 2] !== undefined) out[o++] = (n >> 8) & 255;
    if (clean[i + 3] !== undefined) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/**
 * Envoie la photo dans le dossier de l'utilisateur et renvoie son adresse publique.
 * En mode démo, la photo reste sur le téléphone (adresse locale).
 */
export async function uploadPhoto(photo: PickedPhoto | string, name: string): Promise<string> {
  const p: PickedPhoto = typeof photo === 'string' ? { uri: photo } : photo;
  if (isDemo || !supabase) return p.uri;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) throw new Error('not_signed_in');
  // Contenu : base64 du sélecteur si disponible, sinon téléchargement (photo Google).
  let body: Uint8Array | ArrayBuffer;
  if (p.base64) body = base64ToBytes(p.base64);
  else {
    const res = await fetch(p.uri);
    if (!res.ok) throw new Error(`download_${res.status}`);
    body = await res.arrayBuffer();
  }
  if (body.byteLength > 5 * 1024 * 1024) throw new Error('too_big');
  if (body.byteLength < 100) throw new Error('empty_image');
  const type = p.mimeType && /^image\/(jpeg|png|webp|heic)$/.test(p.mimeType) ? p.mimeType : 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/heic' ? 'heic' : 'jpg';
  const path = `${user.id}/${name}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, body, { contentType: type, upsert: true });
  if (error) throw new Error(`upload: ${error.message}`);
  // Paramètre de version : la nouvelle photo s'affiche tout de suite malgré les caches.
  return `${supabase.storage.from('media').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

export async function saveAvatarUrl(url: string | null) {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) throw new Error('not_signed_in');
  const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
  if (error) throw new Error(`profile: ${error.message}`);
}

const tried = new Set<string>();

/**
 * Connexion avec Google (ou Apple) : si le compte n'a pas encore de photo de profil, on recopie
 * celle du fournisseur dans le dossier de l'utilisateur (une seule tentative par session).
 * Renvoie true si une photo a été enregistrée.
 */
export async function importProviderAvatar(): Promise<boolean> {
  if (isDemo || !supabase) return false;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user || tried.has(user.id)) return false;
  tried.add(user.id);
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = (typeof meta.avatar_url === 'string' && meta.avatar_url) || (typeof meta.picture === 'string' && meta.picture) || null;
  if (!raw || !/^https:\/\//.test(raw)) return false;
  // Photo Google en plus grand (l'adresse par défaut est en 96 px).
  const url = raw.replace(/=s\d+(-c)?$/, '=s400-c');
  try {
    await saveAvatarUrl(await uploadPhoto(url, 'avatar'));
    return true;
  } catch {
    return false;
  }
}
