import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Sans backend configuré, l'app tourne en mode démo (tout est calculé sur le téléphone). */
export const isDemo = !url || !anonKey;

// Les jetons de session sont rangés dans le trousseau iOS / Keystore Android,
// pas dans un stockage en clair.
// Le trousseau iOS est fiable jusqu'à ~2 Ko par valeur : la session est découpée en morceaux.
const CHUNK = 1800;
const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await SecureStore.getItemAsync(`${key}.n`);
    if (!n) return SecureStore.getItemAsync(key);
    const parts = await Promise.all(Array.from({ length: Number(n) }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.some((p) => p == null) ? null : parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    const n = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    await Promise.all([
      ...Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)),
      SecureStore.deleteItemAsync(`${key}.n`),
      SecureStore.deleteItemAsync(key),
    ]);
  },
};

export const supabase = isDemo
  ? null
  : createClient(url!, anonKey!, {
      // Web : stockage par défaut du navigateur (le trousseau n'existe que sur téléphone).
      auth: { storage: Platform.OS === 'web' ? undefined : secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
    });

/** Appel d'une fonction serveur avec le jeton de l'utilisateur. */
export async function callFunction<T>(name: string, body: Record<string, unknown> | object): Promise<T> {
  if (!supabase) throw new Error('demo_mode');
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body as Record<string, unknown> });
  if (error) throw error;
  return data as T;
}
