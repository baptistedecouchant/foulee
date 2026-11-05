// Comptes utilisateurs : connexion OBLIGATOIRE au premier lancement.
//
//  - Apple (natif sur iPhone dans l'app installée, sinon par navigateur)
//  - Google (navigateur)
//  - E-mail + mot de passe, avec prénom, nom et date de naissance.
//    L'adresse est confirmée par un code à 6 chiffres reçu par e-mail.
//
// Après Google ou Apple, s'il manque la date de naissance ou les consentements,
// l'app les demande (écran « Compléter mon profil »).

import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type Provider = 'google' | 'apple';

export interface Profile {
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null; // AAAA-MM-JJ
  termsAccepted: boolean;
  healthConsent: boolean;
  weightKg: number | null;
  heightCm: number | null;
  /** Objectifs et avancement visibles par les amis. */
  shareGoals: boolean;
  avatarUrl: string | null;
  email: string | null;
  providers: string[];
}

export const MIN_AGE = 15;

function client() {
  if (!supabase) throw new Error('demo_mode');
  return supabase;
}

// ---------- Date de naissance ----------

/** "12/04/1995" → "1995-04-12" (null si invalide). */
export function parseFrenchDate(input: string): string | null {
  const m = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number) as unknown as [number, number, number, number];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ageOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

/** Saisie « JJ/MM/AAAA » avec les barres ajoutées automatiquement. */
export function maskDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function birthDateError(input: string): string | null {
  const iso = parseFrenchDate(input);
  if (!iso) return 'Date au format JJ/MM/AAAA.';
  const age = ageOf(iso);
  if (age < MIN_AGE) return `Foulée est accessible à partir de ${MIN_AGE} ans.`;
  if (age > 110) return 'Vérifie l’année de naissance.';
  return null;
}

export const passwordError = (p: string) =>
  p.length < 8 ? '8 caractères minimum.' : !/[0-9]/.test(p) || !/[a-zA-Z]/.test(p) ? 'Au moins une lettre et un chiffre.' : null;

// ---------- E-mail + mot de passe ----------

export async function signUpWithPassword(p: { email: string; password: string; firstName: string; lastName: string; birthDate: string }) {
  const { data, error } = await client().auth.signUp({
    email: p.email.trim().toLowerCase(),
    password: p.password,
    options: {
      data: {
        first_name: p.firstName.trim(),
        last_name: p.lastName.trim(),
        birth_date: p.birthDate,
        terms_accepted: true,
        health_consent: true,
      },
    },
  });
  if (error) throw error;
  // Supabase renvoie un utilisateur sans identité si l'e-mail est déjà inscrit.
  if (data.user && (data.user.identities ?? []).length === 0) throw new Error('email_exists');
  return { needsCode: !data.session };
}

/** Code à 6 chiffres reçu par e-mail pour confirmer l'adresse. */
export async function confirmSignUp(email: string, code: string) {
  const { error } = await client().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'signup' });
  if (error) throw error;
}

export async function resendSignUpCode(email: string) {
  const { error } = await client().auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
  if (error) throw error;
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error) throw error;
}

/** Réinitialisation : code reçu par e-mail + nouveau mot de passe. */
export async function confirmPasswordReset(email: string, code: string, newPassword: string) {
  const sb = client();
  const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'recovery' });
  if (error) throw error;
  const { error: e2 } = await sb.auth.updateUser({ password: newPassword });
  if (e2) throw e2;
}

// ---------- Google / Apple ----------

export const redirectUrl = () => Linking.createURL('auth');

export async function nativeAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

export async function signInWithProvider(provider: Provider): Promise<'ok' | 'cancelled'> {
  const sb = client();

  if (provider === 'apple' && (await nativeAppleAvailable())) {
    const nonce = Crypto.randomUUID();
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      nonce: hashed,
    });
    if (!cred.identityToken) throw new Error('apple_no_token');
    const { error } = await sb.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce });
    if (error) throw error;
    // Apple ne donne le nom qu'à la toute première connexion : on le garde.
    if (cred.fullName?.givenName) {
      const { data } = await sb.auth.getUser();
      if (data.user) {
        await sb
          .from('profiles')
          .update({ first_name: cred.fullName.givenName, last_name: cred.fullName.familyName ?? null, display_name: cred.fullName.givenName })
          .eq('id', data.user.id);
      }
    }
    return 'ok';
  }

  const redirectTo = redirectUrl();
  const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  if (!data?.url) throw new Error('no_auth_url');
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return 'cancelled';
  const params = Linking.parse(res.url).queryParams ?? {};
  if (typeof params.error_description === 'string') throw new Error(params.error_description);
  const code = typeof params.code === 'string' ? params.code : null;
  if (!code) throw new Error('no_auth_code');
  const { error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return 'ok';
}

// ---------- Profil ----------

export async function loadProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data: p } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', u.user.id)
    .maybeSingle();
  return {
    firstName: p?.first_name ?? null,
    lastName: p?.last_name ?? null,
    birthDate: p?.birth_date ?? null,
    termsAccepted: Boolean(p?.terms_accepted_at),
    healthConsent: Boolean(p?.health_consent_at),
    weightKg: p?.weight_kg != null ? Number(p.weight_kg) : null,
    heightCm: p?.height_cm ?? null,
    shareGoals: p?.share_goals !== false,
    avatarUrl: p?.avatar_url ?? null,
    email: u.user.email ?? null,
    providers: (u.user.identities ?? []).map((i) => i.provider),
  };
}

export const profileComplete = (p: Profile | null) => Boolean(p && p.firstName && p.lastName && p.birthDate && p.termsAccepted && p.healthConsent);

export async function completeProfile(p: { firstName: string; lastName: string; birthDate: string }) {
  const sb = client();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error('not_signed_in');
  const now = new Date().toISOString();
  const { error } = await sb
    .from('profiles')
    .update({
      first_name: p.firstName.trim(),
      last_name: p.lastName.trim(),
      display_name: p.firstName.trim().slice(0, 24),
      birth_date: p.birthDate,
      terms_accepted_at: now,
      health_consent_at: now,
    })
    .eq('id', data.user.id);
  if (error) throw error;
}

/** Poids et taille : servent à adapter la charge d'entraînement et l'estimation de progression. */
export async function saveBodyMetrics(m: { weightKg: number | null; heightCm: number | null }) {
  const sb = client();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error('not_signed_in');
  const { error } = await sb.from('profiles').update({ weight_kg: m.weightKg, height_cm: m.heightCm }).eq('id', data.user.id);
  if (error) throw error;
}

export async function setShareGoals(on: boolean) {
  const sb = client();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error('not_signed_in');
  const { error } = await sb.from('profiles').update({ share_goals: on }).eq('id', data.user.id);
  if (error) throw error;
}

export const weightError = (w: number | null) => (w != null && (w < 25 || w > 250) ? 'Poids entre 25 et 250 kg' : null);
export const heightError = (h: number | null) => (h != null && (h < 100 || h > 230) ? 'Taille entre 100 et 230 cm' : null);

export async function signOut() {
  await client().auth.signOut();
}

/** Messages d'erreur compréhensibles. */
export function authErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/email_exists|already been registered|already registered|user_already_exists/i.test(msg)) return 'Un compte existe déjà avec cet e-mail. Connecte-toi.';
  if (/invalid login credentials|invalid_credentials/i.test(msg)) return 'E-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(msg)) return 'Adresse e-mail pas encore confirmée : entre le code reçu par e-mail.';
  if (/expired|invalid.*(token|otp)|token has expired/i.test(msg)) return 'Code incorrect ou expiré. Demande un nouveau code.';
  if (/rate limit|too many|security purposes/i.test(msg)) return 'Trop de tentatives. Attends quelques minutes avant de réessayer.';
  if (/weak|password should/i.test(msg)) return 'Mot de passe trop faible : 8 caractères minimum, avec lettres et chiffres.';
  if (/invalid_birth_date/i.test(msg)) return `Foulée est accessible à partir de ${MIN_AGE} ans.`;
  if (/provider is not enabled|unsupported provider|validation_failed/i.test(msg)) return 'Cette méthode de connexion n’est pas encore activée. Utilise l’e-mail pour l’instant.';
  if (/network|fetch/i.test(msg)) return 'Pas de connexion internet.';
  return 'La connexion a échoué. Réessaie dans un instant.';
}
