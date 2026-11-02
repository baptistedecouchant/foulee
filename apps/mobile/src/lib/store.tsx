import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildPlan, computeLedger, type LedgerEntry, type Plan, type PlanRequest } from '@foulee/core';

import { simulate, type DemoResult, type Scenario } from '@/lib/demo';
import { callFunction, isDemo } from '@/lib/supabase';

export type Provider = 'garmin' | 'apple_health' | 'health_connect' | 'strava';

export interface Enrichment {
  resume: string;
  weeks: Record<string, string>;
  sessions: Record<string, { tip: string; nutrition: string }>;
}

export interface Redemption {
  rewardId: string;
  title: string;
  cost: number;
  code: string;
  date: string;
}

interface PersistedState {
  plan: Plan | null;
  enrichment: Enrichment | null;
  validations: Record<string, DemoResult>;
  sent: Record<string, boolean>;
  connections: Record<Provider, boolean>;
  redemptions: Redemption[];
  /** Points gagnés sur les plans précédents. */
  carry: number;
}

const INITIAL: PersistedState = {
  plan: null,
  enrichment: null,
  validations: {},
  sent: {},
  connections: { garmin: false, apple_health: false, health_connect: false, strava: false },
  redemptions: [],
  carry: 0,
};

const KEY = 'foulee/state/v1';

function ledgerOf(s: PersistedState): LedgerEntry[] {
  const out: LedgerEntry[] = s.carry ? [{ kind: 'carry', label: 'Plans précédents', points: s.carry }] : [];
  if (s.plan) out.push(...computeLedger(s.plan, s.validations));
  for (const r of s.redemptions) out.push({ kind: 'redeem', label: r.title, points: -r.cost, ref: r.code });
  return out;
}

interface Store extends PersistedState {
  ready: boolean;
  ledger: LedgerEntry[];
  balance: number;
  createPlan(req: PlanRequest): Promise<void>;
  setEnrichment(e: Enrichment): void;
  setConnection(p: Provider, on: boolean): void;
  sendToWatch(sessionId: string): Promise<void>;
  simulateSync(sessionId: string, scenario: Scenario): DemoResult | null;
  resetSession(sessionId: string): void;
  redeem(r: { id: string; title: string; cost: number }): Redemption | null;
}

const Ctx = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(INITIAL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setState({ ...INITIAL, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const ledger = useMemo(() => ledgerOf(state), [state]);
  const balance = useMemo(() => ledger.reduce((a, e) => a + e.points, 0), [ledger]);

  const createPlan = useCallback(async (req: PlanRequest) => {
    // En production, le plan est calculé et enregistré par le serveur (même moteur).
    const plan = isDemo ? buildPlan(req) : (await callFunction<{ plan: Plan }>('create-plan', req)).plan;
    setState((s) => {
      const prevPoints = ledgerOf(s).filter((e) => e.kind !== 'redeem' && e.kind !== 'carry').reduce((a, e) => a + e.points, 0);
      return { ...s, plan, enrichment: null, validations: {}, sent: {}, carry: s.carry + prevPoints };
    });
  }, []);

  const value: Store = {
    ...state,
    ready,
    ledger,
    balance,
    createPlan,
    setEnrichment: (e) => setState((s) => ({ ...s, enrichment: e })),
    setConnection: (p, on) => setState((s) => ({ ...s, connections: { ...s.connections, [p]: on } })),
    sendToWatch: async (sessionId) => {
      if (!isDemo) await callFunction('push-workout', { sessionId });
      setState((s) => ({ ...s, sent: { ...s.sent, [sessionId]: true } }));
    },
    simulateSync: (sessionId, scenario) => {
      const session = state.plan?.sessions.find((x) => x.id === sessionId);
      const source = (['garmin', 'apple_health', 'health_connect', 'strava'] as Provider[]).find((p) => state.connections[p]);
      if (!session || !source) return null;
      const result = simulate(session, scenario, source);
      setState((s) => {
        const prev = s.validations[sessionId];
        // Une meilleure exécution remplace une moins bonne, jamais l'inverse (comme côté serveur).
        if (prev && prev.points >= result.points && prev.status !== 'refusee') return s;
        return { ...s, validations: { ...s.validations, [sessionId]: result } };
      });
      return result;
    },
    resetSession: (sessionId) =>
      setState((s) => {
        const { [sessionId]: _, ...rest } = s.validations;
        return { ...s, validations: rest };
      }),
    redeem: (r) => {
      if (balance < r.cost) return null;
      const code = `DEMO-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const red: Redemption = { rewardId: r.id, title: r.title, cost: r.cost, code, date: new Date().toISOString().slice(0, 10) };
      setState((s) => ({ ...s, redemptions: [red, ...s.redemptions] }));
      return red;
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore hors de AppProvider');
  return s;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateFr(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', opts);
}
