import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { GoalCelebration } from '@/components/goal-celebration';
import { getPendingCelebration, setPendingCelebration } from '@/lib/celebration-store';
import { todayIso, useStore } from '@/lib/store';

/** Plein écran de félicitations après la création d'un objectif (page à part entière : fiable sur iOS). */
export default function CelebrateScreen() {
  const [data] = useState(getPendingCelebration);
  const { getPlan } = useStore();
  if (!data) return <Redirect href="/" />;

  const leave = (to: 'session' | 'plan') => {
    setPendingCelebration(null);
    const entry = getPlan(data.id);
    const today = todayIso();
    const first = entry?.plan.sessions.find((x) => x.date >= today) ?? entry?.plan.sessions[0];
    if (to === 'session' && first) router.replace({ pathname: '/session/[id]', params: { id: first.id, plan: data.id } });
    else router.replace({ pathname: '/plan/[id]', params: { id: data.id } });
  };

  return <GoalCelebration title={data.title} subtitle={data.subtitle} stats={data.stats} onStart={() => leave('session')} onPlan={() => leave('plan')} />;
}
