// Comptes utilisateurs.
//
// Parcours : l'utilisateur commence SANS compte (session anonyme, zéro friction). Quand il veut
// garder ses données, retrouver ses amis ou recevoir son bonus de bienvenue, il RELIE son compte
// à un e-mail, Google ou Apple : ses plans, séances et RunCoins sont conservés.
// Sur un nouveau téléphone, il se CONNECTE avec la même méthode.
//
// E-mail : code à 6 chiffres reçu par e-mail (pas de mot de passe à retenir, marche dans Expo Go).
// Google / Apple : page d'autorisation du fournisseur ; Apple en natif sur iPhone quand c'est possible.

import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type Provider = 'google' | 'apple';

export interface Account {
  anonymous: boolean;
  email: string | null;
  providers: string[];
}

function client() {
  if (!supabase) throw new Error('demo_mode');
  return supabase;
}

export async function currentAccount(): Promise<Account | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;
  return {
    anonymous: Boolean(u.is_anonymous),
    email: u.email ?? null,
    providers: (u.identities ?? []).map((i) => i.provider).filter((p) => p !== 'anonymous'),
  };
}

// ---------- E-mail (code à 6 chiffres) ----------

/** Relie l'e-mail au compte actuel (anonyme) : un code est envoyé. */
export async function linkEmail(email: string) {
  const { error } = await client().auth.updateUser({ email: email.trim().toLowerCase() });
  if (error) throw error;
}

export async function confirmLinkEmail(email: string, code: string) {
  const { error } = await client().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email_change' });
  if (error) throw error;
}

/** Connexion à un compte existant (nouveau téléphone) : un code est envoyé. */
export async function sendSignInCode(email: string) {
  const { error } = await client().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } });
  if (error) throw error;
}

export async function confirmSignIn(email: string, code: string) {
  const { error } = await client().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
  if (error) throw error;
}

// ---------- Google / Apple ----------

export const redirectUrl = () => Linking.createURL('auth');

/** Apple en natif : uniquement dans l'app installée sur iPhone (pas Expo Go). */
export async function nativeAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

async function appleIdToken(): Promise<{ token: string; nonce: string }> {
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const cred = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    nonce: hashed,
  });
  if (!cred.identityToken) throw new Error('apple_no_token');
  return { token: cred.identityToken, nonce };
}

/**
 * `link` : relie Google/Apple au compte actuel (garde les données).
 * `signin` : se connecte à un compte existant (remplace la session anonyme).
 */
export async function oauth(provider: Provider, mode: 'link' | 'signin'): Promise<'ok' | 'cancelled'> {
  const sb = client();

  if (provider === 'apple' && (await nativeAppleAvailable())) {
    const { token, nonce } = await appleIdToken();
    const { error } =
      mode === 'link' ? await sb.auth.linkIdentity({ provider: 'apple', token, nonce }) : await sb.auth.signInWithIdToken({ provider: 'apple', token, nonce });
    if (error) throw error;
    return 'ok';
  }

  const redirectTo = redirectUrl();
  const { data, error } =
    mode === 'link'
      ? await sb.auth.linkIdentity({ provider, options: { redirectTo, skipBrowserRedirect: true } })
      : await sb.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  if (!data?.url) throw new Error('no_auth_url');

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return 'cancelled';

  // Flux PKCE : le fournisseur renvoie un code à échanger contre la session.
  const params = Linking.parse(res.url).queryParams ?? {};
  if (typeof params.error_description === 'string') throw new Error(params.error_description);
  const code = typeof params.code === 'string' ? params.code : null;
  if (!code) throw new Error('no_auth_code');
  const { error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return 'ok';
}

/** Déconnexion : repart sur une nouvelle session anonyme (l'app reste utilisable). */
export async function signOut() {
  const sb = client();
  await sb.auth.signOut();
  await sb.auth.signInAnonymously();
}

/** Messages d'erreur compréhensibles. */
export function authErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/already been registered|already exists|identity_already_exists|email_exists/i.test(msg)) {
    return 'Ce compte existe déjà. Utilise « J’ai déjà un compte » pour t’y connecter.';
  }
  if (/expired|invalid.*token|otp/i.test(msg)) return 'Code incorrect ou expiré. Demande un nouveau code.';
  if (/rate limit|too many/i.test(msg)) return 'Trop de tentatives. Attends quelques minutes avant de réessayer.';
  if (/not found|signups not allowed|user not found/i.test(msg)) return 'Aucun compte avec cet e-mail. Crée plutôt ton compte.';
  if (/provider is not enabled|unsupported provider/i.test(msg)) return 'Cette méthode de connexion n’est pas encore activée sur le serveur.';
  if (/manual linking/i.test(msg)) return 'La liaison de comptes n’est pas activée sur le serveur (Manual linking).';
  return 'La connexion a échoué. Réessaie dans un instant.';
}
