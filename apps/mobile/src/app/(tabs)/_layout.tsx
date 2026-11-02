import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/hooks/use-theme';
import { useSocial } from '@/lib/social';
import { useStore } from '@/lib/store';

// Barre d'onglets native : sur iOS 26 elle prend automatiquement l'apparence Liquid Glass
// (flottante, translucide, qui se rétracte au défilement).
export default function TabsLayout() {
  const t = useTheme();
  const { quests } = useStore();
  const openQuests = quests.filter((q) => !q.done).length;
  const { overview } = useSocial();
  const hubBadge =
    (overview?.incoming.length ?? 0) +
    (overview?.challenges.filter((c) => c.myStatus === 'invited' && !c.finished).length ?? 0) +
    (overview?.conversations.reduce((a, c) => a + c.unread, 0) ?? 0);

  return (
    <NativeTabs tintColor={t.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Accueil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'flame', selected: 'flame.fill' }} md="local_fire_department" />
        {openQuests > 0 ? <NativeTabs.Trigger.Badge>{String(openQuests)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plans">
        <NativeTabs.Trigger.Label>Entraînements</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.run" md="directions_run" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="hub">
        <NativeTabs.Trigger.Label>Hub</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} md="groups" />
        {hubBadge > 0 ? <NativeTabs.Trigger.Badge>{String(hubBadge)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rewards">
        <NativeTabs.Trigger.Label>Récompenses</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} md="emoji_events" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
