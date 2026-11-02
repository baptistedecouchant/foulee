import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Sans backend configuré, l'app tourne en mode démo (tout est calculé sur le téléphone). */
export const isDemo = !url || !anonKey;

// Les jetons de session sont rangés dans le trousseau iOS / Keystore Android,
// pas dans un stockage en clair.
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = isDemo
  ? null
  : createClient(url!, anonKey!, {
      auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });

/** Appel d'une fonction serveur avec le jeton de l'utilisateur. */
export async function callFunction<T>(name: string, body: Record<string, unknown> | object): Promise<T> {
  if (!supabase) throw new Error('demo_mode');
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body as Record<string, unknown> });
  if (error) throw error;
  return data as T;
}
