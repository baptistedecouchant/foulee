import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  analyzeActivity,
  isInWindow,
  buildPlan,
  evaluateSession,
  type Activity,
  type SessionValidation,
  applyCaps,
  computeLedger,
  ECONOMY,
  sponsoredChallengeOf,
  sponsoredProgress,
  weeklyRoom,
  type Earning,
  type GrantedEarning,
  type SponsoredChallenge,
  computeStats,
  levelInfo,
  mondayOf,
  weeklyQuests,
  type LevelInfo,
  type Plan,
  type PlanRequest,
  type Quest,
  type Stats,
  type TrustReport,
} from '@foulee/core';

import { nativeAdsAvailable, showRewardedAd } from '@/lib/ads';
import { simulate, type DemoResult, type Scenario } from '@/lib/demo';
import { healthAvailable, readRuns, requestHealthAccess, stepsToday } from '@/lib/health';
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
  /** Pubs regardées (démo : créditées localement ; en ligne : créditées par le serveur). */
  ads: Array<{ date: string; ref: string }>;
  /** Challenges sponsorisés réclamés (démo). */
  sponsoredClaims: string[];
  /** Solde serveur (mode connecté). */
  serverBalance?: number;
  /** Historique serveur des gains (mode connecté). */
  serverLedger?: Array<{ kind: string; label: string; points: number; created_at: string }>;
}

const INITIAL: PersistedState = {
  plans: [],
  connections: { garmin: false, apple_health: false, health_connect: false, strava: false },
  redemptions: [],
  ads: [],
  sponsoredClaims: [],
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

/** Tous les gains dus (avant plafonds) : séances, semaines, pubs, challenges sponsorisés. */
function earningsOf(s: PersistedState): Earning[] {
  const out: Earning[] = [];
  for (const p of s.plans) out.push(...computeLedger(p.plan, p.validations, `${p.id}:`));
  for (const a of s.ads) out.push({ kind: 'ad', label: 'Pub regardée', amount: ECONOMY.adReward, date: a.date, ref: a.ref });
  for (const w of s.sponsoredClaims) out.push({ kind: 'sponsored', label: `Challenge sponsorisé (${w})`, amount: ECONOMY.sponsoredChallenge, date: w, ref: `sp-${w}` });
  return out;
}

/** Courses validées (pour les challenges). */
export function runsOf(plans: PlanEntry[]) {
  return plans.flatMap((p) =>
    p.plan.sessions
      .filter((x) => ['validee', 'partielle'].includes(p.validations[x.id]?.status ?? ''))
      .map((x) => {
        const [y, m, d] = x.date.split('-').map(Number);
        return { startTime: new Date(y, m - 1, d, 18).getTime(), distanceM: x.distanceM * Math.min(1, p.validations[x.id].volumeScore || 1) };
      }),
  );
}

interface Store extends PersistedState {
  ready: boolean;
  syncing: boolean;
  /** Gains après plafonds (démo) ou historique serveur. */
  ledger: Array<{ label: string; amount: number; capped?: string; date: string }>;
  balance: number;
  room: { earned: number; left: number; adsLeftToday: number };
  sponsored: { challenge: SponsoredChallenge; progress: number; claimed: boolean };
  claimSponsored(): void;
  /** Pub récompensée. Renvoie les RC crédités (0 si plafond atteint ou pub non terminée). */
  watchAd(play: () => Promise<boolean>): Promise<number>;
  adsMode: 'native' | 'demo' | 'off';
  steps: number | null;
  health: 'unavailable' | 'available' | 'connected';
  connectHealth(): Promise<number>;
  importHealthRuns(): Promise<number>;
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
  /** Séance faite dans l'app avec le GPS du téléphone. */
  recordRun(planId: string, sessionId: string, activity: Activity): Promise<DemoResult | null>;
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
      const { data: hist } = await supabase.from('points_ledger').select('kind, label, points, created_at').order('created_at', { ascending: false }).limit(100);

      setState((s) => ({
        ...s,
        serverBalance: bal?.balance ?? 0,
        serverLedger: hist ?? [],
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
  const granted: GrantedEarning[] = useMemo(() => applyCaps(earningsOf(state)), [state]);
  const ledger = useMemo(() => {
    if (!isDemo) {
      return (state.serverLedger ?? []).map((e) => ({ label: e.label, amount: e.points, date: e.created_at.slice(0, 10) }));
    }
    return [
      ...granted.map((g) => ({ label: g.label, amount: g.granted, capped: g.capped, date: g.date })),
      ...state.redemptions.map((r) => ({ label: r.title, amount: -r.cost, date: r.date })),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }, [granted, state.redemptions, state.serverLedger]);
  const balance = useMemo(
    () => (isDemo ? granted.reduce((a, g) => a + g.granted, 0) - state.redemptions.reduce((a, r) => a + r.cost, 0) : (state.serverBalance ?? 0)),
    [granted, state.redemptions, state.serverBalance],
  );
  const room = useMemo(() => weeklyRoom(granted, todayIso()), [granted]);
  const sponsored = useMemo(() => {
    const week = mondayOf(todayIso());
    const challenge = sponsoredChallengeOf(week);
    return { challenge, progress: sponsoredProgress(challenge, runsOf(state.plans), week), claimed: state.sponsoredClaims.includes(week) };
  }, [state.plans, state.sponsoredClaims]);

  // ---------- Apple Santé : disponibilité, pas du jour ----------
  const [healthOk, setHealthOk] = useState(false);
  const [steps, setSteps] = useState<number | null>(null);
  useEffect(() => {
    healthAvailable().then(setHealthOk);
  }, []);
  useEffect(() => {
    if (!healthOk || !state.connections.apple_health) return;
    const load = () => stepsToday().then(setSteps);
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [healthOk, state.connections.apple_health]);
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

  /** Enregistre un résultat de séance, calcule l'XP gagnée et déclenche l'écran de célébration. */
  const applyResult = (planId: string, sessionId: string, result: DemoResult): DemoResult => {
    const entry = state.plans.find((p) => p.id === planId)!;
    const prev = entry.validations[sessionId];
    if (prev && prev.points >= result.points && prev.status !== 'refusee' && result.status !== 'refusee') {
      setCelebration({ points: 0, xp: 0, status: result.status });
      return prev;
    }
    const after = state.plans.map((p) =>
      p.id === planId ? { plan: p.plan, validations: { ...p.validations, [sessionId]: result } } : { plan: p.plan, validations: p.validations },
    );
    const newStats = computeStats(after, todayIso());
    const newLevel = levelInfo(newStats.xp);
    updatePlan(planId, (p) => ({ ...p, validations: { ...p.validations, [sessionId]: result } }));
    setCelebration({
      points: Math.max(0, result.points - (prev?.points ?? 0)),
      xp: Math.max(0, newStats.xp - stats.xp),
      status: result.status,
      levelUp: newLevel.level > level.level ? newLevel : undefined,
      newTitle: newLevel.title !== level.title,
    });
    Haptics.notificationAsync(
      result.status === 'validee' || result.status === 'partielle' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    return result;
  };

  /** Import des séances Apple Santé : rattachées automatiquement aux séances prévues. */
  const importHealthRuns = async (): Promise<number> => {
    const runs = await readRuns(new Date(Date.now() - 30 * 86_400_000));
    if (!isDemo) {
      for (const a of runs) await callFunction('ingest-activity', { ...a, manual: a.manual ? true : false }).catch(() => {});
      await refresh();
      return runs.length;
    }
    let matched = 0;
    setState((st) => {
      let plans = st.plans;
      for (const a of runs) {
        const trust = analyzeActivity(a);
        const candidates = plans.flatMap((p) =>
          p.plan.sessions.filter((x) => isInWindow(x, a.startTime) && p.validations[x.id]?.status !== 'validee').map((x) => ({ p, x })),
        );
        if (!candidates.length) continue;
        const day = new Date(a.startTime).toISOString().slice(0, 10);
        const pick = candidates.find((c) => c.x.date === day) ?? candidates.sort((u, v) => Math.abs(u.x.durationSec - a.durationSec) - Math.abs(v.x.durationSec - a.durationSec))[0];
        const result: DemoResult = { ...evaluateSession(pick.x, a, trust), trust, source: 'apple_health' };
        const prev = pick.p.validations[pick.x.id];
        if (prev && prev.points >= result.points) continue;
        matched++;
        plans = plans.map((p) => (p.id === pick.p.id ? { ...p, validations: { ...p.validations, [pick.x.id]: result } } : p));
      }
      return { ...st, plans };
    });
    return matched;
  };

  const value: Store = {
    ...state,
    room,
    sponsored,
    steps,
    health: !healthOk ? 'unavailable' : state.connections.apple_health ? 'connected' : 'available',
    adsMode: nativeAdsAvailable() ? 'native' : isDemo ? 'demo' : 'off',
    claimSponsored: () => {
      const week = mondayOf(todayIso());
      if (sponsored.claimed || sponsored.progress < sponsored.challenge.target || !isDemo) return;
      setState((st) => ({ ...st, sponsoredClaims: [...st.sponsoredClaims, week] }));
      setCelebration({ points: ECONOMY.sponsoredChallenge, xp: 0, status: 'validee' });
    },
    watchAd: async (play) => {
      if (room.adsLeftToday <= 0) return 0;
      if (nativeAdsAvailable() && supabase) {
        // Vraie pub : le serveur crédite après vérification de Google (quelques secondes).
        const { data } = await supabase.auth.getUser();
        const ok = await showRewardedAd(data.user?.id ?? '');
        if (ok) setTimeout(() => refresh().catch(() => {}), 4000);
        return ok ? ECONOMY.adReward : 0;
      }
      if (!isDemo) return 0;
      const ok = await play(); // pub de démonstration
      if (!ok) return 0;
      setState((st) => ({ ...st, ads: [...st.ads, { date: todayIso(), ref: `ad-${Date.now()}` }] }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return ECONOMY.adReward;
    },
    connectHealth: async () => {
      const ok = await requestHealthAccess();
      if (!ok) return -1;
      setState((st) => ({ ...st, connections: { ...st.connections, apple_health: true } }));
      stepsToday().then(setSteps);
      return importHealthRuns();
    },
    importHealthRuns,
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
      return applyResult(planId, sessionId, simulate(session, scenario, source));
    },
    recordRun: async (planId, sessionId, activity) => {
      const entry = state.plans.find((p) => p.id === planId);
      const session = entry?.plan.sessions.find((x) => x.id === sessionId);
      if (!entry || !session) return null;
      if (isDemo) {
        // Mêmes contrôles que le serveur : anti-triche puis validation bloc par bloc.
        const trust = analyzeActivity(activity, Date.now() + 60_000);
        return applyResult(planId, sessionId, { ...evaluateSession(session, activity, trust), trust, source: 'app_gps' });
      }
      const res = await callFunction<{ validation?: SessionValidation }>('ingest-activity', activity);
      if (!res.validation) {
        await refresh();
        return null;
      }
      const out = applyResult(planId, sessionId, { ...res.validation, trust: { verdict: 'trusted', trustScore: 100, flags: [] }, source: 'app_gps' });
      refresh().catch(() => {});
      return out;
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
