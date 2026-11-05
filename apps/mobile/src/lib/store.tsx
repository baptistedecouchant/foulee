import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  analyzeActivity,
  isInWindow,
  buildPlan,
  evaluateSession,
  type Activity,
  type Athlete,
  adaptPlanToVma,
  compareVma,
  reschedulePlan as reschedule,
  type VmaComparison,
  assignRuns,
  shoeWear,
  type RunLog,
  type Shoe,
  type ShoeWear,
  type SessionValidation,
  applyCaps,
  chestEarnings,
  LOGIN_XP,
  loginStreak,
  tipOfDay,
  type DailyTip,
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
  /** Jours où l'app a été ouverte (série de connexion). */
  checkins: string[];
  /** Astuces du jour lues (identifiant = date). */
  tipsRead: string[];
  /** Courses importées d'Apple Santé hors plan (démo). */
  healthRuns?: RunLog[];
  /** Courses vérifiées lues sur le serveur (mode connecté). */
  serverRuns?: RunLog[];
  /** Chaussures et attribution des courses à chaque paire. */
  gear: Gear;
  /** Photo de profil en mode démo (adresse locale). */
  localAvatar?: string | null;
  /** Profil sportif saisi en mode démo (en ligne : il vit dans la fiche du compte). */
  athlete?: Athlete;
  /** Solde serveur (mode connecté). */
  serverBalance?: number;
  /** Historique serveur des gains (mode connecté). */
  serverLedger?: Array<{ kind: string; label: string; points: number; created_at: string }>;
}

export interface Gear {
  shoes: Shoe[];
  defaultShoeId: string | null;
  /** id de course → id de chaussure */
  assignments: Record<string, string>;
}

const EMPTY_GEAR: Gear = { shoes: [], defaultShoeId: null, assignments: {} };

/** Lit un objet `gear` venu du stockage ou du serveur, en ignorant ce qui est mal formé. */
function parseGear(raw: unknown): Gear {
  const g = (raw && typeof raw === 'object' ? raw : {}) as Partial<Gear>;
  const shoes = Array.isArray(g.shoes)
    ? g.shoes.filter((x): x is Shoe => !!x && typeof x.id === 'string' && typeof x.brand === 'string' && typeof x.model === 'string' && Number(x.lifeKm) > 0)
    : [];
  return {
    shoes: shoes.map((x) => ({ ...x, startKm: Number(x.startKm) || 0, lifeKm: Number(x.lifeKm) })),
    defaultShoeId: typeof g.defaultShoeId === 'string' && shoes.some((x) => x.id === g.defaultShoeId) ? g.defaultShoeId : null,
    assignments: g.assignments && typeof g.assignments === 'object' ? (g.assignments as Record<string, string>) : {},
  };
}

const INITIAL: PersistedState = {
  gear: EMPTY_GEAR,
  plans: [],
  connections: { garmin: false, apple_health: false, health_connect: false, strava: false },
  redemptions: [],
  ads: [],
  sponsoredClaims: [],
  checkins: [],
  tipsRead: [],
};

const KEY = 'foulee/state/v2';
export const MAX_ACTIVE_PLANS = 3;

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date locale AAAA-MM-JJ d'un instant. */
export function localDate(d: Date): string {
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
  out.push(...chestEarnings(s.checkins));
  // Bonus de bienvenue : après la première séance validée (en ligne : compte relié requis, vérifié par le serveur).
  const first = s.plans
    .flatMap((p) => p.plan.sessions.filter((x) => p.validations[x.id]?.status === 'validee').map((x) => x.date))
    .sort()[0];
  if (first) out.push({ kind: 'welcome', label: 'Bonus de bienvenue', amount: ECONOMY.welcomeBonus, date: first, ref: 'welcome' });
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
  /** Jours d'affilée où l'app a été ouverte. */
  loginDays: number;
  tip: DailyTip;
  tipRead: boolean;
  readTip(): void;
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
  /** Supprime un entraînement. Renvoie false si le serveur a refusé (le plan est remis). */
  removePlan(id: string): Promise<boolean>;
  /** Nouvelle date de début (avant la première séance faite). */
  reschedulePlan(id: string, startDate: string): Promise<void>;
  /** Enregistre une VMA mesurée ; recale le plan si elle est meilleure que la dernière performance. */
  applyVma(id: string, vma: number): Promise<{ comparison: VmaComparison; adapted: boolean }>;
  setEnrichment(planId: string, e: Enrichment): void;
  setConnection(p: Provider, on: boolean): void;
  setLocalAthlete(a: Athlete): void;
  setLocalAvatar(uri: string | null): void;
  /** Toutes les courses connues, de la plus récente à la plus ancienne. */
  runs: RunLog[];
  shoes: Array<{ shoe: Shoe; wear: ShoeWear; isDefault: boolean }>;
  addShoe(s: Omit<Shoe, 'id' | 'since'>, makeDefault: boolean): void;
  updateShoe(id: string, patch: Partial<Omit<Shoe, 'id'>>): void;
  removeShoe(id: string): void;
  setDefaultShoe(id: string | null): void;
  assignRun(runId: string, shoeId: string | null): void;
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
  // Mode connecté : on n'envoie l'équipement au serveur qu'après l'avoir lu une première fois.
  const gearSynced = useRef(false);

  // ---------- Chargement local + migration depuis la v1 (un seul plan) ----------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          setState({ ...INITIAL, ...saved, gear: parseGear(saved.gear) });
        }
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
      const { data: acts } = await supabase
        .from('activities')
        .select('id, start_time, distance_m, duration_sec, source, trust_verdict, duplicate_of')
        .neq('trust_verdict', 'rejected')
        .is('duplicate_of', null)
        .order('start_time', { ascending: false })
        .limit(80);
      const { data: u } = await supabase.auth.getUser();
      const { data: prof } = u.user ? await supabase.from('profiles').select('gear').eq('id', u.user.id).maybeSingle() : { data: null };
      const serverRuns: RunLog[] = (acts ?? []).map((a) => ({
        id: a.id,
        date: localDate(new Date(a.start_time)),
        distanceKm: Math.round(a.distance_m / 100) / 10,
        durationSec: a.duration_sec,
        source: a.source,
      }));

      setState((s) => ({
        ...s,
        serverBalance: bal?.balance ?? 0,
        serverRuns,
        gear: prof ? parseGear(prof.gear) : s.gear,
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
      gearSynced.current = true;
    } finally {
      setSyncing(false);
    }
  }, []);

  // Mode connecté : les données suivent le compte. Connexion → chargement ; déconnexion → on vide
  // tout ce qui était affiché sur le téléphone (rien ne doit rester d'un compte à l'autre).
  useEffect(() => {
    if (!supabase || !ready) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !data.session.user.is_anonymous) refresh().catch(() => {});
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !session.user.is_anonymous) refresh().catch(() => {});
      if (event === 'SIGNED_OUT') {
        gearSynced.current = false;
        setState((st) => ({ ...INITIAL, checkins: [], tipsRead: st.tipsRead }));
      }
    });
    return () => data.subscription.unsubscribe();
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

  // ---------- Courses et chaussures ----------
  const runs: RunLog[] = useMemo(() => {
    if (!isDemo) return state.serverRuns ?? [];
    const fromPlans: RunLog[] = state.plans.flatMap((p) =>
      p.plan.sessions
        .filter((x) => ['validee', 'partielle'].includes(p.validations[x.id]?.status ?? ''))
        .map((x) => ({
          id: `${p.id}:${x.id}`,
          date: x.date,
          distanceKm: Math.round((x.distanceM / 1000) * Math.min(1, p.validations[x.id].volumeScore || 1) * 10) / 10,
          durationSec: x.durationSec,
          source: p.validations[x.id].source || 'app',
          title: x.title,
        })),
    );
    return [...fromPlans, ...(state.healthRuns ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  }, [state.plans, state.healthRuns, state.serverRuns]);

  // Chaque nouvelle course part sur la paire par défaut.
  useEffect(() => {
    if (!ready) return;
    const next = assignRuns(runs, state.gear.assignments, state.gear.shoes, state.gear.defaultShoeId);
    if (next !== state.gear.assignments) setState((st) => ({ ...st, gear: { ...st.gear, assignments: next } }));
  }, [ready, runs, state.gear]);

  // En ligne : l'équipement suit le compte.
  useEffect(() => {
    if (isDemo || !supabase || !gearSynced.current) return;
    const sb = supabase;
    const t = setTimeout(() => {
      sb.auth.getUser().then(({ data }) => {
        if (data.user) sb.from('profiles').update({ gear: state.gear }).eq('id', data.user.id).then(() => {});
      });
    }, 800);
    return () => clearTimeout(t);
  }, [state.gear]);

  const shoes = useMemo(
    () => state.gear.shoes.map((shoe) => ({ shoe, wear: shoeWear(shoe, runs, state.gear.assignments), isDefault: shoe.id === state.gear.defaultShoeId })),
    [state.gear, runs],
  );
  const setGear = (f: (g: Gear) => Gear) => setState((st) => ({ ...st, gear: f(st.gear) }));

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
  // XP de connexion : jamais de RC, seulement de la progression.
  const extraXp = useMemo(
    () => state.checkins.length * LOGIN_XP.perDay + chestEarnings(state.checkins).length * LOGIN_XP.chest + state.tipsRead.length * LOGIN_XP.tip,
    [state.checkins, state.tipsRead],
  );
  const level = useMemo(() => levelInfo(stats.xp + extraXp), [stats.xp, extraXp]);
  const loginDays = useMemo(() => loginStreak(state.checkins, todayIso()), [state.checkins]);

  // Connexion du jour : une fois par jour à l'ouverture de l'app.
  useEffect(() => {
    if (!ready) return;
    const today = todayIso();
    if (state.checkins.includes(today)) return;
    setState((st) => (st.checkins.includes(today) ? st : { ...st, checkins: [...st.checkins, today].slice(-400) }));
    if (!isDemo) {
      callFunction<{ days: string[] }>('check-in', {})
        .then((r) => r.days && setState((st) => ({ ...st, checkins: r.days })))
        .then(() => refresh())
        .catch(() => {});
    }
  }, [ready, state.checkins, refresh]);
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
    const newLevel = levelInfo(newStats.xp + extraXp);
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
      const known = new Set((st.healthRuns ?? []).map((r) => r.id));
      const healthRuns = [
        ...(st.healthRuns ?? []),
        ...runs
          .filter((a) => !known.has(`hk:${a.startTime}`))
          .map((a) => ({ id: `hk:${a.startTime}`, date: localDate(new Date(a.startTime)), distanceKm: Math.round(a.distanceM / 100) / 10, durationSec: a.durationSec, source: 'apple_health' })),
      ].slice(-200);
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
      return { ...st, plans, healthRuns };
    });
    return matched;
  };

  const value: Store = {
    ...state,
    room,
    sponsored,
    loginDays,
    tip: tipOfDay(todayIso()),
    tipRead: state.tipsRead.includes(todayIso()),
    readTip: () => {
      const today = todayIso();
      if (state.tipsRead.includes(today)) return;
      setState((st) => ({ ...st, tipsRead: [...st.tipsRead, today].slice(-400) }));
      Haptics.selectionAsync().catch(() => {});
    },
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
    reschedulePlan: async (id, startDate) => {
      const entry = state.plans.find((p) => p.id === id);
      if (!entry) throw new Error('plan_not_found');
      if (Object.keys(entry.validations).length) throw new Error('plan_already_started');
      if (isDemo) {
        updatePlan(id, (p) => ({ ...p, plan: reschedule(p.plan, startDate), sent: {} }));
        return;
      }
      await callFunction('create-plan', { action: 'reschedule', planId: id, startDate });
      await refresh();
    },
    applyVma: async (id, vma) => {
      const entry = state.plans.find((p) => p.id === id);
      if (!entry) throw new Error('plan_not_found');
      const comparison = compareVma(entry.plan, vma);
      if (isDemo) {
        const today = todayIso();
        updatePlan(id, (p) => ({ ...p, plan: comparison.adapt ? { ...adaptPlanToVma(p.plan, vma), vma: { value: vma, date: today } } : { ...p.plan, vma: { value: vma, date: today } } }));
        return { comparison, adapted: comparison.adapt };
      }
      const res = await callFunction<{ adapted: boolean }>('create-plan', { action: 'adapt', planId: id, vma });
      await refresh();
      return { comparison, adapted: !!res.adapted };
    },
    removePlan: async (id) => {
      // En ligne : le serveur confirme d'abord, puis le plan disparaît de l'écran.
      if (supabase) {
        const { error } = await supabase.rpc('abandon_plan', { p_plan: id });
        if (error && !/plan_not_found/.test(error.message)) return false;
      }
      setState((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id) }));
      if (supabase) refresh().catch(() => {});
      return true;
    },
    setEnrichment: (planId, e) => updatePlan(planId, (p) => ({ ...p, enrichment: e })),
    setLocalAthlete: (a) => setState((s) => ({ ...s, athlete: a })),
    setLocalAvatar: (uri) => setState((s) => ({ ...s, localAvatar: uri })),
    runs,
    shoes,
    addShoe: (sh, makeDefault) => {
      const id = `sh${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      // On compte à partir d'aujourd'hui : les courses passées restent sur les paires d'avant.
      setGear((g) => ({ ...g, shoes: [...g.shoes, { ...sh, id, since: todayIso() }], defaultShoeId: makeDefault || !g.defaultShoeId ? id : g.defaultShoeId }));
    },
    updateShoe: (id, patch) => setGear((g) => ({ ...g, shoes: g.shoes.map((x) => (x.id === id ? { ...x, ...patch, id } : x)), defaultShoeId: patch.retired && g.defaultShoeId === id ? null : g.defaultShoeId })),
    removeShoe: (id) =>
      setGear((g) => ({
        shoes: g.shoes.filter((x) => x.id !== id),
        defaultShoeId: g.defaultShoeId === id ? null : g.defaultShoeId,
        assignments: Object.fromEntries(Object.entries(g.assignments).filter(([, v]) => v !== id)),
      })),
    setDefaultShoe: (id) => setGear((g) => ({ ...g, defaultShoeId: id })),
    assignRun: (runId, shoeId) =>
      setGear((g) => {
        const assignments = { ...g.assignments };
        // « Aucune paire » est mémorisé pour que la paire par défaut ne la reprenne pas.
        assignments[runId] = shoeId ?? 'none';
        return { ...g, assignments };
      }),
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
