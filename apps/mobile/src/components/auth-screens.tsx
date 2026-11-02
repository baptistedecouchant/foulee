import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Ionicons, Row, Segmented, Txt } from '@/components/ui';
import { Fonts, Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  authErrorMessage,
  birthDateError,
  completeProfile,
  confirmPasswordReset,
  confirmSignUp,
  MIN_AGE,
  maskDate,
  parseFrenchDate,
  passwordError,
  resendSignUpCode,
  sendPasswordReset,
  signInWithPassword,
  signInWithProvider,
  signOut,
  signUpWithPassword,
  type Provider,
} from '@/lib/auth';
import { useSession } from '@/lib/session';

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// ---------- Champs ----------

function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label" muted>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={t.textSecondary}
        {...props}
        style={[styles.input, { color: t.text, borderColor: error ? t.bad : t.line, backgroundColor: t.surface }, props.style]}
      />
      {error ? (
        <Txt variant="caption" color={t.bad}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

function PasswordField({ value, onChangeText, label = 'Mot de passe', error, newPassword }: { value: string; onChangeText: (v: string) => void; label?: string; error?: string | null; newPassword?: boolean }) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label" muted>
        {label}
      </Txt>
      <View style={[styles.input, styles.passwordRow, { borderColor: error ? t.bad : t.line, backgroundColor: t.surface }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          textContentType={newPassword ? 'newPassword' : 'password'}
          placeholder={newPassword ? '8 caractères, lettres et chiffres' : '••••••••'}
          placeholderTextColor={t.textSecondary}
          style={{ flex: 1, color: t.text, fontSize: 16, minHeight: 46 }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Masquer' : 'Afficher'} onPress={() => setShow(!show)} hitSlop={10}>
          <Ionicons name={show ? 'eye-off' : 'eye'} size={20} color={t.textSecondary} />
        </Pressable>
      </View>
      {error ? (
        <Txt variant="caption" color={t.bad}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

function Check({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: ReactNode }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={{ flexDirection: 'row', gap: Spacing.s, alignItems: 'flex-start' }}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? t.accent : t.textSecondary} />
      <Txt variant="caption" style={{ flex: 1 }}>
        {children}
      </Txt>
    </Pressable>
  );
}

function Consents({ terms, health, setTerms, setHealth }: { terms: boolean; health: boolean; setTerms: (v: boolean) => void; setHealth: (v: boolean) => void }) {
  return (
    <View style={{ gap: Spacing.m }}>
      <Check checked={terms} onToggle={() => setTerms(!terms)}>
        J’ai {MIN_AGE} ans ou plus et j’accepte les conditions d’utilisation et la politique de confidentialité de Foulée.
      </Check>
      <Check checked={health} onToggle={() => setHealth(!health)}>
        J’accepte que Foulée traite mes données d’activité et de santé (allure, distance, fréquence cardiaque, pas) pour valider mes séances. Je peux retirer ce
        consentement à tout moment.
      </Check>
    </View>
  );
}

function ProviderButton({ provider, onPress, disabled }: { provider: Provider; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  const apple = provider === 'apple';
  const fg = apple ? '#FFFFFF' : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.provider, { backgroundColor: apple ? '#000000' : t.surface, borderColor: apple ? '#000000' : t.line, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      <Ionicons name={apple ? 'logo-apple' : 'logo-google'} size={20} color={fg} />
      <Txt style={{ fontWeight: '700' }} color={fg}>
        {apple ? 'Continuer avec Apple' : 'Continuer avec Google'}
      </Txt>
    </Pressable>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + Spacing.l, paddingBottom: insets.bottom + Spacing.xxl }]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Hero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <LinearGradient colors={Gradients.energy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <Row>
        <View style={styles.logo}>
          <Ionicons name="footsteps" size={26} color="#3A4BFF" />
        </View>
        <Txt variant="title" color="#fff" style={{ fontFamily: Fonts.rounded }}>
          Foulée
        </Txt>
      </Row>
      <Txt variant="display" color="#fff">
        {title}
      </Txt>
      <Txt color="rgba(255,255,255,0.88)">{subtitle}</Txt>
    </LinearGradient>
  );
}

function Feedback({ message }: { message: { ok: boolean; text: string } | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <Ionicons name={message.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={message.ok ? t.ok : t.bad} />
      <Txt style={{ flex: 1 }} color={message.ok ? t.ok : t.bad}>
        {message.text}
      </Txt>
    </Row>
  );
}

// ---------- Écran de connexion / inscription ----------

type Step = 'form' | 'code' | 'forgot' | 'reset';

export function AuthScreen() {
  const t = useTheme();
  const { reload } = useSession();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [step, setStep] = useState<Step>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birth, setBirth] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ ok: false, text: authErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const errors = {
    firstName: firstName.trim() ? null : 'Indique ton prénom.',
    lastName: lastName.trim() ? null : 'Indique ton nom.',
    birth: birthDateError(birth),
    email: emailOk(email) ? null : 'Adresse e-mail invalide.',
    password: mode === 'signup' ? passwordError(password) : password ? null : 'Indique ton mot de passe.',
  };
  const signupValid = !errors.firstName && !errors.lastName && !errors.birth && !errors.email && !errors.password && terms && health;
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);

  // --- Code de confirmation de l'e-mail ---
  if (step === 'code') {
    return (
      <Shell>
        <Hero title="Vérifie ta boîte mail" subtitle={`Un code à 6 chiffres a été envoyé à ${email.trim()}. Regarde aussi dans les spams.`} />
        <Field
          label="Code reçu"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="123456"
          style={styles.code}
        />
        <Feedback message={message} />
        <Button label={busy ? 'Vérification…' : 'Valider'} icon="checkmark-circle" disabled={code.length !== 6 || busy} onPress={() => run(async () => { await confirmSignUp(email, code); await reload(); })} />
        <Button kind="ghost" small label="Renvoyer le code" disabled={busy} onPress={() => run(async () => { await resendSignUpCode(email); setMessage({ ok: true, text: 'Nouveau code envoyé.' }); })} />
        <Button kind="ghost" small label="Modifier mes informations" onPress={() => setStep('form')} />
      </Shell>
    );
  }

  // --- Mot de passe oublié ---
  if (step === 'forgot' || step === 'reset') {
    return (
      <Shell>
        <Hero title="Mot de passe oublié" subtitle="On t’envoie un code par e-mail pour choisir un nouveau mot de passe." />
        <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={step === 'forgot'} />
        {step === 'forgot' ? (
          <Button label={busy ? 'Envoi…' : 'Recevoir un code'} icon="mail" disabled={!emailOk(email) || busy} onPress={() => run(async () => { await sendPasswordReset(email); setStep('reset'); })} />
        ) : (
          <>
            <Field label="Code reçu" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" placeholder="123456" style={styles.code} />
            <PasswordField label="Nouveau mot de passe" value={password} onChangeText={setPassword} error={password ? passwordError(password) : null} newPassword />
            <Button
              label={busy ? 'Enregistrement…' : 'Changer mon mot de passe'}
              icon="key"
              disabled={code.length !== 6 || !!passwordError(password) || busy}
              onPress={() => run(async () => { await confirmPasswordReset(email, code, password); await reload(); })}
            />
          </>
        )}
        <Feedback message={message} />
        <Button kind="ghost" small label="Retour à la connexion" onPress={() => { setStep('form'); setMode('signin'); setCode(''); }} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Hero
        title={mode === 'signup' ? 'Prêt à courir ?' : 'Content de te revoir'}
        subtitle={mode === 'signup' ? 'Crée ton compte pour obtenir ton plan sur mesure, gagner des RunCoins et retrouver tes amis.' : 'Connecte-toi pour retrouver tes plans, tes séances et tes RunCoins.'}
      />

      {Platform.OS !== 'android' && <ProviderButton provider="apple" disabled={busy} onPress={() => run(async () => { const r = await signInWithProvider('apple'); if (r === 'ok') await reload(); })} />}
      <ProviderButton provider="google" disabled={busy} onPress={() => run(async () => { const r = await signInWithProvider('google'); if (r === 'ok') await reload(); })} />

      <Row style={{ gap: Spacing.m }}>
        <View style={[styles.rule, { backgroundColor: t.line }]} />
        <Txt variant="caption" muted>
          ou avec ton e-mail
        </Txt>
        <View style={[styles.rule, { backgroundColor: t.line }]} />
      </Row>

      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setMessage(null);
          setTouched(false);
        }}
        options={[
          { value: 'signup', label: 'Créer un compte' },
          { value: 'signin', label: 'Se connecter' },
        ]}
      />

      {mode === 'signup' && (
        <>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label="Prénom" value={firstName} onChangeText={setFirstName} autoComplete="given-name" textContentType="givenName" maxLength={50} error={show('firstName')} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Nom" value={lastName} onChangeText={setLastName} autoComplete="family-name" textContentType="familyName" maxLength={50} error={show('lastName')} />
            </View>
          </Row>
          <Field
            label="Date de naissance"
            value={birth}
            onChangeText={(v) => setBirth(maskDate(v))}
            keyboardType="number-pad"
            placeholder="JJ/MM/AAAA"
            autoComplete="birthdate-full"
            error={touched || birth.length === 10 ? errors.birth : null}
          />
        </>
      )}
      <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={show('email')} />
      <PasswordField value={password} onChangeText={setPassword} error={show('password')} newPassword={mode === 'signup'} />

      {mode === 'signup' && <Consents terms={terms} health={health} setTerms={setTerms} setHealth={setHealth} />}

      <Feedback message={message} />

      {mode === 'signup' ? (
        <Button
          label={busy ? 'Création…' : 'Créer mon compte'}
          icon="person-add"
          disabled={busy}
          onPress={() => {
            setTouched(true);
            if (!signupValid) {
              if (!terms || !health) setMessage({ ok: false, text: 'Coche les deux cases pour continuer.' });
              return;
            }
            run(async () => {
              const r = await signUpWithPassword({ email, password, firstName, lastName, birthDate: parseFrenchDate(birth)! });
              if (r.needsCode) setStep('code');
              else await reload();
            });
          }}
        />
      ) : (
        <>
          <Button
            label={busy ? 'Connexion…' : 'Se connecter'}
            icon="log-in"
            disabled={busy}
            onPress={() => {
              setTouched(true);
              if (errors.email || errors.password) return;
              run(async () => {
                await signInWithPassword(email, password);
                await reload();
              });
            }}
          />
          <Button kind="ghost" small label="Mot de passe oublié ?" onPress={() => { setStep('forgot'); setMessage(null); setCode(''); setPassword(''); }} />
        </>
      )}
    </Shell>
  );
}

// ---------- Compléter le profil (après Google / Apple) ----------

export function CompleteProfileScreen() {
  const { profile, reload } = useSession();
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [birth, setBirth] = useState('');
  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const birthErr = birthDateError(birth);
  const valid = firstName.trim() && lastName.trim() && !birthErr && terms && health;

  return (
    <Shell>
      <Hero title="Encore une étape" subtitle="Quelques informations pour finaliser ton compte." />
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Field label="Prénom" value={firstName} onChangeText={setFirstName} autoComplete="given-name" maxLength={50} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Nom" value={lastName} onChangeText={setLastName} autoComplete="family-name" maxLength={50} />
        </View>
      </Row>
      <Field
        label="Date de naissance"
        value={birth}
        onChangeText={(v) => setBirth(maskDate(v))}
        keyboardType="number-pad"
        placeholder="JJ/MM/AAAA"
        error={birth.length === 10 ? birthErr : null}
      />
      <Consents terms={terms} health={health} setTerms={setTerms} setHealth={setHealth} />
      <Feedback message={message} />
      <Button
        label={busy ? 'Enregistrement…' : 'Commencer'}
        icon="rocket"
        disabled={!valid || busy}
        onPress={async () => {
          setBusy(true);
          setMessage(null);
          try {
            await completeProfile({ firstName, lastName, birthDate: parseFrenchDate(birth)! });
            await reload();
          } catch (e) {
            setMessage({ ok: false, text: authErrorMessage(e) });
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button kind="ghost" small label="Utiliser un autre compte" onPress={() => signOut()} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: Spacing.l, gap: Spacing.l },
  hero: { borderRadius: Radius.l, padding: Spacing.xl, gap: Spacing.m },
  logo: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: Radius.s, paddingHorizontal: Spacing.m, minHeight: 48, fontSize: 16 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  code: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontWeight: '800' },
  provider: { borderRadius: Radius.m, borderWidth: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.s },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
