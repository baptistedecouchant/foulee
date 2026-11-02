import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/lib/store';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const t = useTheme();
  const { balance } = useStore();
  const icon = (name: IconName) =>
    function TabIcon({ color, size }: { color: ColorValue; size: number }) {
      return <Ionicons name={name} color={color as string} size={size} />;
    };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textSecondary,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        headerStyle: { backgroundColor: t.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: t.text, fontWeight: '800' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Mon plan', tabBarLabel: 'Plan', tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach', tabBarIcon: icon('chatbubble-ellipses-outline') }} />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Récompenses',
          tabBarIcon: icon('gift-outline'),
          tabBarBadge: balance <= 0 ? undefined : balance < 1000 ? String(balance) : `${(balance / 1000).toFixed(1).replace('.', ',')}k`,
          tabBarBadgeStyle: { backgroundColor: t.gold, color: t.goldText, fontSize: 10 },
        }}
      />
      <Tabs.Screen name="devices" options={{ title: 'Montres', tabBarIcon: icon('watch-outline') }} />
    </Tabs>
  );
}
