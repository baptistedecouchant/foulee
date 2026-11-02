import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildPlan,
  computeLedger,
  computeStats,
  levelInfo,
  mondayOf,
  weeklyQuests,
  type LedgerEntry,
  type LevelInfo,
  type Plan,
  type PlanRequest,
  type Quest,
  type Stats,
  type TrustReport,
} from '@foulee/core';

import { simulate, type DemoResult, type Scenario } from '@/lib/demo';
import { imageForPlan, type ImageKey } from '@/lib/images';
import { callFunction, isDemo, supabase } from '@/lib/supabase';

export type Provider = 'garmin' | 'apple_health' | 'health_connect' | 'strava';

export interface Enrichment {
  resume: string;
  weeks: Record<string, string>;
  sessions: Record<string, { tip: string; nutrition: string }>;
}

export interface PlanEntry {
  id: string;
  plan: Plan;
  image: ImageKey;
  createdAt: string;
  enrichment: Enrichment | null;
  validations: Record<string, DemoResult>;
  sent: Record<string, boolean>;
}

export interface Redemption {
  rewardId: string;
  title: string;
  cost: number;
  code: string;
  date: string;
}

/** Ce qui vient de se passer après une validation : sert à l'écran de célébration. */
export interface Celebration {
  points: number;
  xp: number;
  levelUp?: LevelInfo;
  /** Le passage de niveau débloque un nouveau titre (Joggeur, Coureur…). */
  newTitle?: boolean;
  status: DemoResult['status'];
}

interface PersistedState {
  plans: PlanEntry[];
  connections: Record<Provider, boolean>;
  redemptions: Redemption[];
  /** Solde serveur (mode connecté). */
  serverBalance?: number;
}

const INITIAL: PersistedState = {
  plans: [],
  connections: { garmin: false, apple_health: false, health_connect: false, strava: false },
  redemptions: [],
};

const KEY = 'foulee/state/v2';
export const MAX_ACTIVE_PLANS = 3;

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateFr(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', opts);
}

function ledgerOf(s: PersistedState): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const p of s.plans) out.push(...computeLedger(p.plan, p.validations).map((e) => ({ ...e, ref: `${p.id}:${e.ref ?? e.kind}` })));
  for (const r of s.redemptions) out.push({ kind: 'redeem', label: r.title, points: -r.cost, ref: r.code });
  return out;
}

interface Store extends PersistedState {
  ready: boolean;
  syncing: boolean;
  ledger: LedgerEntry[];
  balance: number;
  stats: Stats;
  level: LevelInfo;
  quests: Quest[];
  celebration: Celebration | null;
  dismissCelebration(): void;
  getPlan(id: string): PlanEntry | undefined;
  createPlan(req: PlanRequest): Promise<string>;
  removePlan(id: string): void;
  setEnrichment(planId: string, e: Enrichment): void;
  setConnection(p: Provider, on: boolean): void;
  connectStrava(): Promise<'connected' | 'cancelled' | 'error' | string>;
  sendToWatch(planId: string, sessionId: string): Promise<void>;
  simulateSync(planId: string, sessionId: string, scenario: Scenario): DemoResult | null;
  resetSession(planId: string, sessionId: string): void;
  redeem(r: { id: string; title: string; cost: number }): Redemption | null;
  refresh(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(INITIAL);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  // ---------- Chargement local + migration depuis la v1 (un seul plan) ----------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setState({ ...INITIAL, ...JSON.parse(raw) });
        else {
          const v1 = await AsyncStorage.getItem('foulee/state/v1');
          if (v1) {
            const o = JSON.parse(v1);
            if (o.plan) {
              setState({
                ...INITIAL,
                connections: o.connections ?? INITIAL.connections,
                redemptions: o.redemptions ?? [],
                plans: [
                  {
                    id: `p${Date.now()}`,
                    plan: o.plan,
                    image: imageForPlan(o.plan),
                    createdAt: todayIso(),
                    enrichment: o.enrichment ?? null,
                    validations: o.validations ?? {},
                    sent: o.sent ?? {},
                  },
                ],
              });
            }
          }
        }
      } catch {
        // stockage indisponible : on démarre vide
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  // ---------- Mode connecté : session anonyme + lecture des données serveur ----------
  const refresh = useCallback(async () => {
    if (!supabase) return;
    setSyncing(true);
    try {
      const { data: plans } = await supabase.from('plans').select('id, plan, ai_enrichment, image_key, created_at').eq('status', 'active').order('created_at');
      const ids = (plans ?? []).map((p) => p.id);
      const { data: vals } = ids.length
        ? await supabase
            .from('session_validations')
            .select('plan_id, session_id, status, score, volume_score, intensity_score, points, feedback, activities(source, trust_score, trust_flags, trust_verdict)')
            .in('plan_id', ids)
        : { data: [] };
      const { data: sent } = ids.length
        ? await supabase.from('planned_sessions').select('plan_id, id').in('plan_id', ids).not('sent_to_watch_at', 'is', null)
        : { data: [] };
      const { data: conns } = await supabase.from('device_connections').select('provider').is('revoked_at', null);
      const { data: bal } = await supabase.from('points_balance').select('balance').maybeSingle();

      setState((s) => ({
        ...s,
        serverBalance: bal?.balance ?? 0,
        connections: { ...INITIAL.connections, ...Object.fromEntries((conns ?? []).map((c) => [c.provider, true])) },
        plans: (plans ?? []).map((p) => ({
          id: p.id,
          plan: p.plan as Plan,
          image: (p.image_key as ImageKey) ?? imageForPlan(p.plan as Plan),
          createdAt: p.created_at,
          enrichment: (p.ai_enrichment as Enrichment) ?? null,
          sent: Object.fromEntries((sent ?? []).filter((x) => x.plan_id === p.id).map((x) => [x.id, true])),
          validations: Object.fromEntries(
            (vals ?? [])
              .filter((v) => v.plan_id === p.id)
              .map((v) => {
                const act = (v as unknown as { activities?: { source: string; trust_score: number; trust_flags: TrustReport['flags']; trust_verdict: TrustReport['verdict'] } }).activities;
                const r: DemoResult = {
                  sessionId: v.session_id,
                  status: v.status,
                  score: Number(v.score),
                  volumeScore: Number(v.volume_score),
                  intensityScore: Number(v.intensity_score),
                  points: v.points,
                  feedback: v.feedback,
                  source: act?.source ?? '',
                  trust: { verdict: act?.trust_verdict ?? 'trusted', trustScore: act?.trust_score ?? 100, flags: act?.trust_flags ?? [] },
                };
                return [v.session_id, r];
              }),
          ),
        })),
      }));
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase || !ready) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      // Pas encore de compte : session anonyme (le compte pourra être relié à un e-mail plus tard).
      if (!data.session) await supabase.auth.signInAnonymously();
      await refresh();
    })().catch(() => {});
  }, [ready, refresh]);

  // ---------- Dérivés : points, XP, niveau, défis ----------
  const ledger = useMemo(() => ledgerOf(state), [state]);
  const balance = useMemo(
    () => (isDemo ? ledger.reduce((a, e) => a + e.points, 0) : (state.serverBalance ?? 0)),
    [ledger, state.serverBalance],
  );
  const progress = useMemo(() => state.plans.map((p) => ({ plan: p.plan, validations: p.validations })), [state.plans]);
  const stats = useMemo(() => computeStats(progress, todayIso()), [progress]);
  const level = useMemo(() => levelInfo(stats.xp), [stats.xp]);
  const quests = useMemo(() => weeklyQuests(progress, mondayOf(todayIso())), [progress]);

  const createPlan = useCallback(async (req: PlanRequest) => {
    if (isDemo) {
      const plan = buildPlan(req);
      const id = `p${Date.now()}`;
      setState((s) => ({
        ...s,
        plans: [...s.plans, { id, plan, image: imageForPlan(plan), createdAt: todayIso(), enrichment: null, validations: {}, sent: {} }],
      }));
      return id;
    }
    const res = await callFunction<{ planId: string }>('create-plan', req);
    await refresh();
    return res.planId;
  }, [refresh]);

  const updatePlan = (id: string, f: (p: PlanEntry) => PlanEntry) =>
    setState((s) => ({ ...s, plans: s.plans.map((p) => (p.id === id ? f(p) : p)) }));

  const value: Store = {
    ...state,
    ready,
    syncing,
    ledger,
    balance,
    stats,
    level,
    quests,
    celebration,
    dismissCelebration: () => setCelebration(null),
    getPlan: (id) => state.plans.find((p) => p.id === id),
    createPlan,
    removePlan: (id) => {
      if (supabase) supabase.from('plans').update({ status: 'abandoned' }).eq('id', id).then(() => refresh());
      setState((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id) }));
    },
    setEnrichment: (planId, e) => updatePlan(planId, (p) => ({ ...p, enrichment: e })),
    setConnection: (p, on) => setState((s) => ({ ...s, connections: { ...s.connections, [p]: on } })),
    connectStrava: async () => {
      // Le secret Strava reste sur le serveur : l'app ouvre juste la page d'autorisation.
      const returnUrl = Linking.createURL('strava');
      const { url } = await callFunction<{ url: string }>('strava-connect', { returnUrl });
      const res = await WebBrowser.openAuthSessionAsync(url, returnUrl);
      if (res.type !== 'success') return 'cancelled';
      const status = Linking.parse(res.url).queryParams?.strava;
      await refresh();
      return typeof status === 'string' ? status : 'error';
    },
    sendToWatch: async (planId, sessionId) => {
      if (!isDemo) await callFunction('push-workout', { planId, sessionId });
      updatePlan(planId, (p) => ({ ...p, sent: { ...p.sent, [sessionId]: true } }));
    },
    simulateSync: (planId, sessionId, scenario) => {
      const entry = state.plans.find((p) => p.id === planId);
      const session = entry?.plan.sessions.find((x) => x.id === sessionId);
      const source = (['garmin', 'apple_health', 'health_connect', 'strava'] as Provider[]).find((p) => state.connections[p]);
      if (!entry || !session || !source) return null;
      const result = simulate(session, scenario, source);
      const prev = entry.validations[sessionId];
      if (prev && prev.points >= result.points && prev.status !== 'refusee') return prev;

      // XP avant / après pour détecter un passage de niveau.
      const after = state.plans.map((p) =>
        p.id === planId ? { plan: p.plan, validations: { ...p.validations, [sessionId]: result } } : { plan: p.plan, validations: p.validations },
      );
      const newStats = computeStats(after, todayIso());
      const newLevel = levelInfo(newStats.xp);
      updatePlan(planId, (p) => ({ ...p, validations: { ...p.validations, [sessionId]: result } }));
      setCelebration({
        points: result.points - (prev?.points ?? 0),
        xp: newStats.xp - stats.xp,
        status: result.status,
        levelUp: newLevel.level > level.level ? newLevel : undefined,
        newTitle: newLevel.title !== level.title,
      });
      Haptics.notificationAsync(
        result.status === 'validee' || result.status === 'partielle' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      ).catch(() => {});
      return result;
    },
    resetSession: (planId, sessionId) =>
      updatePlan(planId, (p) => {
        const { [sessionId]: _, ...rest } = p.validations;
        return { ...p, validations: rest };
      }),
    redeem: (r) => {
      if (balance < r.cost) return null;
      const code = `DEMO-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const red: Redemption = { rewardId: r.id, title: r.title, cost: r.cost, code, date: todayIso() };
      setState((s) => ({ ...s, redemptions: [red, ...s.redemptions] }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return red;
    },
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore hors de AppProvider');
  return s;
}
