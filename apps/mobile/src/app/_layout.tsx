import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthScreen, CompleteProfileScreen } from '@/components/auth-screens';
import { CelebrationOverlay } from '@/components/celebration';
import { Colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/session';
import { SocialProvider } from '@/lib/social';
import { AppProvider, useStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { ready } = useStore();
  const { status } = useSession();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  useEffect(() => {
    if (ready && status !== 'loading') SplashScreen.hideAsync();
  }, [ready, status]);

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{ ...base, colors: { ...base.colors, primary: c.accent, background: c.background, card: c.surface, text: c.text, border: c.line } }}>
      <StatusBar style="auto" />
      {/* Connexion obligatoire : rien n'est accessible sans compte (sauf en mode démo). */}
      {status === 'signedOut' ? (
        <AuthScreen />
      ) : status === 'incomplete' ? (
        <CompleteProfileScreen />
      ) : status === 'loading' ? null : (
      <Stack screenOptions={{ headerBackTitle: 'Retour', headerTintColor: c.accent, headerShadowVisible: false, headerTransparent: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="coach" options={{ title: 'Coach IA' }} />
        <Stack.Screen name="shoes" options={{ title: 'Mes chaussures' }} />
        <Stack.Screen name="runs" options={{ title: 'Mes dernières courses' }} />
        <Stack.Screen name="celebrate" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="goal" options={{ presentation: 'modal', title: 'Nouvel objectif' }} />
        <Stack.Screen name="plan/[id]" options={{ title: '' }} />
        <Stack.Screen name="session/[id]" options={{ title: '' }} />
        <Stack.Screen name="run/[id]" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="devices" options={{ title: 'Montres & apps' }} />
        <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
        <Stack.Screen name="player/[id]" options={{ title: '' }} />
        <Stack.Screen name="chat/[id]" options={{ title: '' }} />
        <Stack.Screen name="challenge/new" options={{ presentation: 'modal', title: 'Lancer un défi' }} />
      </Stack>
      )}
      <CelebrationOverlay />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <AppProvider>
        <SocialProvider>
          <Navigator />
        </SocialProvider>
      </AppProvider>
    </SessionProvider>
  );
}
