import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ECONOMY } from '@foulee/core';

import { Button, Card, Chip, Ionicons, Row, Segmented, Txt } from '@/components/ui';
import { GradientCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  authErrorMessage,
  confirmLinkEmail,
  confirmSignIn,
  currentAccount,
  linkEmail,
  oauth,
  sendSignInCode,
  signOut,
  type Account,
  type Provider,
} from '@/lib/auth';
import { useStore } from '@/lib/store';
import { isDemo } from '@/lib/supabase';

type Mode = 'link' | 'signin';

export default function AccountScreen() {
  const t = useTheme();
  const { refresh } = useStore();
  const [account, setAccount] = useState<Account | null>(null);
  const [mode, setMode] = useState<Mode>('link');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const load = useCallback(() => currentAccount().then(setAccount), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fn();
      if (r === 'cancelled') return;
      await load();
      await refresh().catch(() => {});
      if (success) setMessage({ ok: true, text: success });
    } catch (e) {
      setMessage({ ok: false, text: authErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  if (isDemo) {
    return (
      <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
        <Card>
          <Txt variant="title">Comptes disponibles avec le serveur</Txt>
          <Txt muted>En mode démo, tout reste sur ce téléphone. Une fois le serveur activé, tu pourras créer ton compte avec Apple, Google ou ton e-mail.</Txt>
        </Card>
      </ScrollView>
    );
  }

  const linked = account && !account.anonymous;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <GradientCard colors={linked ? Gradients.xp : Gradients.night}>
        <Row>
          <Ionicons name={linked ? 'shield-checkmark' : 'person-circle'} size={28} color="#fff" />
          <Txt variant="title" color="#fff">
            {linked ? 'Compte protégé' : 'Compte invité'}
          </Txt>
        </Row>
        {linked ? (
          <>
            {account?.email && <Txt color="#fff">{account.email}</Txt>}
            <Row style={{ flexWrap: 'wrap' }}>
              {account?.providers.map((p) => (
                <Chip key={p} tone="glass" icon={p === 'apple' ? 'logo-apple' : p === 'google' ? 'logo-google' : 'mail'} label={p === 'email' ? 'E-mail' : p[0].toUpperCase() + p.slice(1)} />
              ))}
            </Row>
          </>
        ) : (
          <Txt color="rgba(255,255,255,0.85)">
            Tes plans, séances et RunCoins sont liés à ce téléphone. Crée ton compte pour les garder, les retrouver sur un autre appareil et recevoir
            ton bonus de bienvenue de {ECONOMY.welcomeBonus} RC après ta première séance validée.
          </Txt>
        )}
      </GradientCard>

      {!linked && (
        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            setCodeSent(false);
            setCode('');
            setMessage(null);
          }}
          options={[
            { value: 'link', label: 'Créer mon compte' },
            { value: 'signin', label: 'J’ai déjà un compte' },
          ]}
        />
      )}

      {!linked && mode === 'signin' && (
        <Txt variant="caption" muted>
          Les données de ce compte invité seront remplacées par celles de ton compte.
        </Txt>
      )}

      {(!linked || (account && !account.providers.includes('google')) || (account && !account.providers.includes('apple'))) && (
        <Card>
          <Txt variant="label" muted>
            {linked ? 'Ajouter une méthode de connexion' : mode === 'link' ? 'Avec' : 'Se connecter avec'}
          </Txt>
          {(Platform.OS === 'ios' || Platform.OS === 'web') && !(linked && account?.providers.includes('apple')) && (
            <ProviderButton provider="apple" disabled={busy} onPress={() => run(() => oauth('apple', linked ? 'link' : mode), 'Compte Apple relié.')} />
          )}
          {!(linked && account?.providers.includes('google')) && (
            <ProviderButton provider="google" disabled={busy} onPress={() => run(() => oauth('google', linked ? 'link' : mode), 'Compte Google relié.')} />
          )}
        </Card>
      )}

      {!linked && (
        <Card>
          <Txt variant="label" muted>
            Ou par e-mail (code à 6 chiffres, sans mot de passe)
          </Txt>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="ton@email.fr"
            placeholderTextColor={t.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!codeSent}
            style={[styles.input, { color: t.text, borderColor: t.line, backgroundColor: t.surfaceAlt }]}
          />
          {!codeSent ? (
            <Button
              icon="mail"
              label={busy ? 'Envoi…' : 'Recevoir un code'}
              disabled={!validEmail || busy}
              onPress={() =>
                run(async () => {
                  await (mode === 'link' ? linkEmail(email) : sendSignInCode(email));
                  setCodeSent(true);
                }, 'Code envoyé : regarde ta boîte mail (et les spams).')
              }
            />
          ) : (
            <>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={t.textSecondary}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                style={[styles.input, styles.code, { color: t.text, borderColor: t.line, backgroundColor: t.surfaceAlt }]}
              />
              <Button
                icon="checkmark-circle"
                label={busy ? 'Vérification…' : 'Valider'}
                disabled={code.length !== 6 || busy}
                onPress={() => run(() => (mode === 'link' ? confirmLinkEmail(email, code) : confirmSignIn(email, code)), 'C’est fait, ton compte est prêt !')}
              />
              <Button
                kind="ghost"
                small
                label="Changer d’e-mail"
                onPress={() => {
                  setCodeSent(false);
                  setCode('');
                }}
              />
            </>
          )}
        </Card>
      )}

      {message && (
        <Row style={{ alignItems: 'flex-start' }}>
          <Ionicons name={message.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={message.ok ? t.ok : t.bad} />
          <Txt style={{ flex: 1 }} color={message.ok ? t.ok : t.bad}>
            {message.text}
          </Txt>
        </Row>
      )}

      {linked &&
        (confirmSignOut ? (
          <Card>
            <Txt style={{ fontWeight: '700' }}>Se déconnecter de ce téléphone ?</Txt>
            <Txt muted>Tes données restent sur ton compte. Tu pourras t’y reconnecter à tout moment.</Txt>
            <Row>
              <View style={{ flex: 1 }}>
                <Button kind="secondary" label="Annuler" onPress={() => setConfirmSignOut(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  kind="flame"
                  label="Se déconnecter"
                  onPress={() =>
                    run(async () => {
                      await signOut();
                      setConfirmSignOut(false);
                    })
                  }
                />
              </View>
            </Row>
          </Card>
        ) : (
          <Button kind="ghost" icon="log-out-outline" label="Se déconnecter" onPress={() => setConfirmSignOut(true)} />
        ))}

      <Txt variant="caption" muted style={{ textAlign: 'center' }}>
        Tes données de santé ne sont jamais revendues. Elles servent uniquement à valider tes séances.
      </Txt>
    </ScrollView>
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
      style={({ pressed }) => [
        styles.provider,
        { backgroundColor: apple ? '#000000' : t.surface, borderColor: apple ? '#000000' : t.line, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}>
      <Ionicons name={apple ? 'logo-apple' : 'logo-google'} size={20} color={fg} />
      <Txt style={{ fontWeight: '700' }} color={fg}>
        {apple ? 'Continuer avec Apple' : 'Continuer avec Google'}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 60 },
  input: { borderWidth: 1, borderRadius: Radius.s, paddingHorizontal: Spacing.m, minHeight: 48, fontSize: 16 },
  code: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontWeight: '800' },
  provider: { borderRadius: Radius.m, borderWidth: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.s },
});
