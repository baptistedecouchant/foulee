import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { CelebrationOverlay } from '@/components/celebration';
import { Colors } from '@/constants/theme';
import { SocialProvider } from '@/lib/social';
import { AppProvider, useStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { ready } = useStore();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{ ...base, colors: { ...base.colors, primary: c.accent, background: c.background, card: c.surface, text: c.text, border: c.line } }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerBackTitle: 'Retour', headerTintColor: c.accent, headerShadowVisible: false, headerTransparent: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="goal" options={{ presentation: 'modal', title: 'Nouvel objectif' }} />
        <Stack.Screen name="plan/[id]" options={{ title: '' }} />
        <Stack.Screen name="session/[id]" options={{ title: '' }} />
        <Stack.Screen name="run/[id]" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="devices" options={{ title: 'Montres & apps' }} />
        <Stack.Screen name="player/[id]" options={{ title: '' }} />
        <Stack.Screen name="chat/[id]" options={{ title: '' }} />
        <Stack.Screen name="challenge/new" options={{ presentation: 'modal', title: 'Lancer un défi' }} />
      </Stack>
      <CelebrationOverlay />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <SocialProvider>
        <Navigator />
      </SocialProvider>
    </AppProvider>
  );
}
