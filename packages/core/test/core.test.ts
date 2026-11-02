import { describe, expect, it } from 'vitest';
import {
  analyzeActivity,
  assessGoal,
  buildPlan,
  computeLedger,
  dedupeActivities,
  evaluateSession,
  flattenSteps,
  parseTime,
  toWatchWorkout,
  trackFingerprint,
  type Activity,
  type PlanRequest,
  type TrackPoint,
} from '../src/index.ts';

const START = '2026-11-02'; // un lundi

const tenK45: PlanRequest = {
  goal: { mode: 'chrono', sport: 'running', distanceKm: 10, targetTimeSec: 45 * 60, eventDate: '2027-01-10' },
  level: { kind: 'race', distanceKm: 10, timeSec: 49 * 60 + 30 },
  sessionsPerWeek: 4,
  startDate: START,
};

// ---- Générateur de traces réalistes (bruit GPS, cadence, FC) ----
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function makeTrack(opts: {
  start: number;
  blocks: Array<{ sec: number; paceSecPerKm: number }>;
  noise?: boolean;
  cadence?: number;
  hr?: number;
  seed?: number;
}): TrackPoint[] {
  const r = rng(opts.seed ?? 42);
  const pts: TrackPoint[] = [];
  let lat = 48.8566;
  let lon = 2.3522;
  let t = opts.start;
  let heading = 0;
  for (const b of opts.blocks) {
    for (let i = 0; i < b.sec; i++) {
      const v = (1000 / b.paceSecPerKm) * (opts.noise === false ? 1 : 0.94 + r() * 0.12);
      heading += opts.noise === false ? 0 : (r() - 0.5) * 0.2;
      lat += (v * Math.cos(heading)) / 111_320;
      lon += (v * Math.sin(heading)) / (111_320 * Math.cos((lat * Math.PI) / 180));
      t += opts.noise === false ? 1000 : 1000 + Math.round((r() - 0.5) * 60);
      pts.push({
        t,
        lat,
        lon,
        cadence: opts.cadence ?? 170 + Math.round((r() - 0.5) * 8),
        hr: opts.hr ?? 140 + Math.round(r() * 20),
        accuracy: 5 + r() * 5,
      });
    }
  }
  return pts;
}

const sessionStart = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 18).getTime();
};

const NOW = new Date(2027, 2, 1).getTime();

describe('objectif', () => {
  it('parse les temps', () => {
    expect(parseTime('45:00')).toBe(2700);
    expect(parseTime('1:45:00')).toBe(6300);
    expect(parseTime('45:75')).toBeNull();
    expect(parseTime('abc')).toBeNull();
  });

  it('10 km en 45 min depuis 49:30 en 10 semaines : réaliste mais exigeant', () => {
    const a = assessGoal(tenK45.goal, tenK45.level, START);
    expect(a.weeks).toBe(10);
    expect(a.feasibility).toBe('exigeant');
  });

  it('propose un temps réaliste quand le chrono visé est hors de portée', () => {
    const a = assessGoal({ ...tenK45.goal, targetTimeSec: 38 * 60 }, tenK45.level, START);
    expect(a.feasibility).toBe('trop_ambitieux');
    expect(a.suggestedTimeSec).toBeGreaterThan(38 * 60);
  });

  it("refuse un marathon en 6 semaines pour un débutant", () => {
    const a = assessGoal(
      { mode: 'distance', sport: 'running', distanceKm: 42.195, eventDate: '2026-12-13' },
      { kind: 'estimate', level: 'debutant' },
      START,
    );
    expect(a.feasibility).toBe('delai_court');
  });

  it('objectif distance : finir un semi', () => {
    const a = assessGoal(
      { mode: 'distance', sport: 'running', distanceKm: 21.0975, eventDate: '2027-02-28' },
      { kind: 'estimate', level: 'occasionnel' },
      START,
    );
    expect(a.feasibility).toBe('realiste');
  });
});

describe('plan', () => {
  const plan = buildPlan(tenK45);

  it('génère 10 semaines de 4 séances, course le jour J', () => {
    expect(plan.weeks).toHaveLength(10);
    expect(plan.sessions.filter((s) => s.week === 1)).toHaveLength(4);
    const race = plan.sessions.at(-1)!;
    expect(race.type).toBe('race');
    expect(race.date).toBe('2027-01-10');
  });

  it('suit la périodisation base → développement → spécifique → affûtage', () => {
    expect(plan.weeks.map((w) => w.phase)).toEqual(['base', 'base', 'base', 'dev', 'dev', 'dev', 'spe', 'spe', 'spe', 'taper']);
  });

  it("l'allure objectif est 4:30/km et les footings sont bien plus lents", () => {
    expect(Math.round(plan.racePaceSecPerKm)).toBe(270);
    const ef = plan.sessions.find((s) => s.type === 'ef')!;
    const block = flattenSteps(ef.steps)[0];
    expect(block.pace.lo).toBeGreaterThan(330);
  });

  it('le volume progresse sans dépasser +10 % par semaine hors semaines allégées', () => {
    const vol = plan.weeks.map((w) => plan.sessions.filter((s) => s.week === w.n).reduce((a, s) => a + s.durationSec, 0));
    for (let i = 1; i < 9; i++) expect(vol[i] / vol[i - 1]).toBeLessThan(1.25);
    expect(vol[9]).toBeLessThan(vol[8]);
  });

  it('exporte une séance au format montre', () => {
    const vma = plan.sessions.find((s) => s.type === 'vma')!;
    const w = toWatchWorkout(vma);
    expect(w.steps[0].type).toBe('warmup');
    expect(w.steps[1].type).toBe('repeat');
    expect(w.steps.at(-1)!.type).toBe('cooldown');
  });

  it('gère un objectif distance (semi, 3 séances)', () => {
    const p = buildPlan({
      goal: { mode: 'distance', sport: 'running', distanceKm: 21.0975, eventDate: '2027-02-28' },
      level: { kind: 'estimate', level: 'occasionnel' },
      sessionsPerWeek: 3,
      startDate: START,
    });
    expect(p.sessions.at(-1)!.title).toContain('Semi-marathon');
    expect(p.sessions.every((s) => s.durationSec > 0)).toBe(true);
  });
});

describe('anti-triche GPS', () => {
  const base = (track: TrackPoint[], extra: Partial<Activity> = {}): Activity => {
    const dur = (track.at(-1)!.t - track[0].t) / 1000;
    let dist = 0;
    for (let i = 1; i < track.length; i++) {
      const dLat = (track[i].lat - track[i - 1].lat) * 111_320;
      const dLon = (track[i].lon - track[i - 1].lon) * 111_320 * Math.cos((track[i].lat * Math.PI) / 180);
      dist += Math.hypot(dLat, dLon);
    }
    return { source: 'garmin', externalId: 'x', sport: 'running', startTime: track[0].t, durationSec: dur, distanceM: dist, manual: false, track, ...extra };
  };
  const t0 = sessionStart('2026-11-03');

  it('accepte une vraie sortie', () => {
    const r = analyzeActivity(base(makeTrack({ start: t0, blocks: [{ sec: 2400, paceSecPerKm: 370 }] })), NOW);
    expect(r.verdict).toBe('trusted');
  });

  it('refuse une saisie manuelle', () => {
    const r = analyzeActivity(base(makeTrack({ start: t0, blocks: [{ sec: 600, paceSecPerKm: 370 }] }), { manual: true }), NOW);
    expect(r.verdict).toBe('rejected');
    expect(r.flags.map((f) => f.code)).toContain('MANUAL_ENTRY');
  });

  it('refuse une sortie faite en voiture ou à vélo', () => {
    const r = analyzeActivity(base(makeTrack({ start: t0, blocks: [{ sec: 600, paceSecPerKm: 370 }, { sec: 900, paceSecPerKm: 100 }] })), NOW);
    expect(r.flags.map((f) => f.code)).toContain('VEHICLE_SPEED');
    expect(r.verdict).toBe('rejected');
  });

  it('refuse une position simulée (mock location)', () => {
    const track = makeTrack({ start: t0, blocks: [{ sec: 600, paceSecPerKm: 370 }] }).map((p, i) => (i > 300 ? { ...p, mocked: true } : p));
    expect(analyzeActivity(base(track), NOW).verdict).toBe('rejected');
  });

  it('refuse une trace générée par un simulateur (trop parfaite)', () => {
    const track = makeTrack({ start: t0, blocks: [{ sec: 1800, paceSecPerKm: 300 }], noise: false });
    const r = analyzeActivity(base(track), NOW);
    expect(r.flags.map((f) => f.code)).toContain('SYNTHETIC_TRACK');
  });

  it('détecte une cadence incompatible (vélo à allure de course)', () => {
    const track = makeTrack({ start: t0, blocks: [{ sec: 1800, paceSecPerKm: 200 }], cadence: 80 });
    const r = analyzeActivity(base(track), NOW);
    expect(r.flags.map((f) => f.code)).toContain('CADENCE_MISMATCH');
  });

  it('détecte une distance gonflée', () => {
    const a = base(makeTrack({ start: t0, blocks: [{ sec: 1800, paceSecPerKm: 370 }] }));
    const r = analyzeActivity({ ...a, distanceM: a.distanceM * 1.8 }, NOW);
    expect(r.verdict).toBe('rejected');
  });

  it("reconnaît une trace rejouée (même empreinte), pas une nouvelle sortie sur le même parcours", () => {
    const a = makeTrack({ start: t0, blocks: [{ sec: 1200, paceSecPerKm: 370 }], seed: 1 });
    const replay = a.map((p) => ({ ...p, t: p.t + 7 * 86_400_000 }));
    const other = makeTrack({ start: t0 + 7 * 86_400_000, blocks: [{ sec: 1200, paceSecPerKm: 370 }], seed: 2 });
    expect(trackFingerprint(replay)).toBe(trackFingerprint(a));
    expect(trackFingerprint(other)).not.toBe(trackFingerprint(a));
  });

  it('dédoublonne Garmin + Strava pour la même sortie', () => {
    const track = makeTrack({ start: t0, blocks: [{ sec: 1800, paceSecPerKm: 370 }] });
    const g = base(track);
    const s = { ...g, source: 'strava' as const, externalId: 'strava-1', startTime: g.startTime + 2000 };
    const { kept, dropped } = dedupeActivities([s, g]);
    expect(kept.map((k) => k.source)).toEqual(['garmin']);
    expect(dropped).toHaveLength(1);
  });
});

describe('validation et points', () => {
  const plan = buildPlan(tenK45);

  const runSession = (id: string, pace: (zonePaceMid: number, isRec: boolean) => number, ratio = 1) => {
    const s = plan.sessions.find((x) => x.id === id)!;
    const blocks = flattenSteps(s.steps).map((b) => ({
      sec: Math.round(b.expectedSec * ratio),
      paceSecPerKm: pace((b.pace.lo + b.pace.hi) / 2, b.zone === 'rec'),
    }));
    const track = makeTrack({ start: sessionStart(s.date), blocks });
    const act: Activity = {
      source: 'garmin',
      externalId: id,
      sport: 'running',
      startTime: track[0].t,
      durationSec: (track.at(-1)!.t - track[0].t) / 1000,
      distanceM: 0,
      manual: false,
      track,
    };
    return { s, act };
  };

  it('valide une séance de fractionné bien exécutée', () => {
    const vma = plan.sessions.find((x) => x.type === 'vma')!;
    const { s, act } = runSession(vma.id, (p) => p);
    const v = evaluateSession(s, act, analyzeActivity(act, NOW));
    expect(v.status).toBe('validee');
    expect(v.points).toBeGreaterThan(80);
  });

  it('pénalise un footing couru trop vite', () => {
    const { s, act } = runSession('w1s2', (p) => p * 0.8);
    const v = evaluateSession(s, act, analyzeActivity(act, NOW));
    expect(v.intensityScore).toBeLessThan(0.5);
    expect(v.feedback).toContain('Trop rapide');
  });

  it('valide partiellement une séance écourtée', () => {
    const { s, act } = runSession('w1s4', (p) => p, 0.65);
    const v = evaluateSession(s, act, analyzeActivity(act, NOW));
    expect(v.status).toBe('partielle');
  });

  it('accorde le bonus de semaine complète', () => {
    const validations = Object.fromEntries(
      plan.sessions
        .filter((s) => s.week === 1)
        .map((s) => [s.id, { sessionId: s.id, status: 'validee' as const, score: 1, volumeScore: 1, intensityScore: 1, points: s.basePoints, feedback: '' }]),
    );
    const ledger = computeLedger(plan, validations);
    expect(ledger.some((e) => e.kind === 'week')).toBe(true);
  });
});

import { BADGES, computeStats, levelInfo, weeklyQuests, xpForLevel } from '../src/index.ts';

describe('gamification', () => {
  const plan = buildPlan(tenK45);
  const v = (id: string, score = 1) => ({ sessionId: id, status: 'validee' as const, score, volumeScore: 1, intensityScore: score, points: 100, feedback: '' });

  it('les niveaux progressent et le titre évolue', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(xpForLevel(5)).level).toBe(5);
    expect(levelInfo(xpForLevel(5)).title).toBe('Coureur');
    expect(levelInfo(xpForLevel(5) + 1).progress).toBeGreaterThan(0);
  });

  it('calcule XP, série et badges à partir des validations', () => {
    const week1 = plan.sessions.filter((s) => s.week === 1);
    const validations = Object.fromEntries(week1.map((s) => [s.id, v(s.id)]));
    const stats = computeStats([{ plan, validations }], '2026-11-09');
    expect(stats.sessionsDone).toBe(4);
    expect(stats.streak).toBe(4);
    expect(stats.weeksComplete).toBe(1);
    expect(stats.perfectWeeks).toBe(1);
    expect(stats.xp).toBeGreaterThan(500);
    expect(BADGES.find((b) => b.id === 'week')!.progress(stats)).toBe(1);
  });

  it('une séance passée manquée casse la série', () => {
    const [a, b, c] = plan.sessions;
    const stats = computeStats([{ plan, validations: { [a.id]: v(a.id), [c.id]: v(c.id) } }], '2026-11-08');
    expect(b.date < '2026-11-08').toBe(true);
    expect(stats.streak).toBe(1);
    expect(stats.bestStreak).toBe(1);
  });

  it('propose les défis de la semaine', () => {
    const q = weeklyQuests([{ plan, validations: { w1s1: v('w1s1') } }], '2026-11-02');
    expect(q[0]).toMatchObject({ id: 'all', current: 1, target: 4, done: false });
  });
});

import { announceStep, buildLiveSteps, challengeValue, CHALLENGES, leaderboard, LiveWorkout, nutritionFor, warmupAdvice } from '../src/index.ts';

describe('séance guidée en direct', () => {
  const plan = buildPlan(tenK45);
  const vma = plan.sessions.find((s) => s.type === 'vma' && s.title.includes('400'))!;

  /** Fait « courir » la séance seconde par seconde à une allure donnée (facteur sur l'allure cible). */
  function run(factor: (stepZone: string) => number) {
    const w = new LiveWorkout(vma);
    const events = [...w.start(0)];
    let t = 0;
    let d = 0;
    while (!w.finished && t < 4 * 3600) {
      const s = w.current!;
      const pace = ((s.pace.lo + s.pace.hi) / 2) * factor(s.zone);
      t += 1;
      d += 1000 / pace;
      events.push(...w.update({ elapsedSec: t, distanceM: d, paceSecPerKm: pace, now: t * 1000 }));
    }
    return { w, events };
  }

  it('numérote les répétitions et annonce allure, durée et distance', () => {
    const steps = buildLiveSteps(vma);
    const reps = steps.filter((s) => s.rep);
    expect(reps[0].rep).toEqual({ n: 1, of: reps.length });
    const speech = announceStep(reps[0]);
    expect(speech).toContain('1 sur');
    expect(speech).toContain('400 mètres');
    expect(speech).toContain('au kilomètre');
  });

  it('enchaîne tous les blocs jusqu’à la fin, sans alerte si l’allure est bonne', () => {
    const { w, events } = run(() => 1);
    expect(events.filter((e) => e.type === 'step_start')).toHaveLength(w.steps.length);
    expect(events.at(-1)!.type).toBe('finished');
    expect(events.some((e) => e.type === 'pace_alert')).toBe(false);
    expect(events.some((e) => e.type === 'countdown')).toBe(true);
    expect(w.laps).toHaveLength(w.steps.length);
    expect(w.laps.every((l) => l.end >= l.start)).toBe(true);
  });

  it('alerte quand on court trop vite en échauffement, jamais pendant la récupération', () => {
    const { events } = run((z) => (z === 'ef' || z === 'rec' ? 0.75 : 1));
    const alerts = events.filter((e) => e.type === 'pace_alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((a) => a.type === 'pace_alert' && a.direction === 'too_fast')).toBe(true);
    expect(alerts[0].speech).toContain('Ralentis');
  });

  it('la séance guidée est validée grâce au découpage en blocs', () => {
    const w = new LiveWorkout(vma);
    w.start(0);
    const [y, m, d0] = vma.date.split('-').map(Number);
    const start = new Date(y, m - 1, d0, 18).getTime();
    const track: Array<{ t: number; lat: number; lon: number; cadence: number; hr: number }> = [];
    let lat = 48.85;
    let lon = 2.35;
    let t = 0;
    let d = 0;
    let heading = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    while (!w.finished) {
      const s = w.current!;
      const pace = ((s.pace.lo + s.pace.hi) / 2) * (0.97 + rnd() * 0.06);
      t += 1;
      const v = 1000 / pace;
      d += v;
      heading += (rnd() - 0.5) * 0.2;
      lat += (v * Math.cos(heading)) / 111_320;
      lon += (v * Math.sin(heading)) / (111_320 * Math.cos((lat * Math.PI) / 180));
      track.push({ t: start + t * 1000 + Math.round((rnd() - 0.5) * 40), lat, lon, cadence: 170, hr: 150 });
      w.update({ elapsedSec: t, distanceM: d, paceSecPerKm: pace, now: start + t * 1000 });
    }
    w.laps[0].start = start;
    const act = { source: 'app_gps' as const, externalId: 'live', sport: 'running' as const, startTime: start, durationSec: t, distanceM: d, manual: false, track, laps: w.laps };
    const v = evaluateSession(vma, act, analyzeActivity(act, start + t * 1000 + 60_000));
    expect(v.status).toBe('validee');
  });
});

describe('nutrition et échauffement', () => {
  const plan = buildPlan(tenK45);
  it('conseille avant, pendant et après selon la séance', () => {
    const vma = plan.sessions.find((s) => s.type === 'vma')!;
    const n = nutritionFor(vma, tenK45.goal);
    expect(n.before.length).toBeGreaterThan(0);
    expect(n.after.some((t) => t.text.includes('protéines'))).toBe(true);
    expect(warmupAdvice(vma)).toContain('Échauffement');
    const race = plan.sessions.at(-1)!;
    expect(nutritionFor(race, tenK45.goal).before[0].when).toBe('Les 2 jours avant');
  });
  it('les séances intenses commencent par un échauffement avec accélérations', () => {
    const vma = plan.sessions.find((s) => s.type === 'vma')!;
    const steps = buildLiveSteps(vma);
    expect(steps[0].label).toBe('Échauffement');
    expect(steps[1].label).toBe('Accélération progressive');
    expect(steps.at(-1)!.label).toBe('Retour au calme');
  });
});

describe('défis entre joueurs', () => {
  const day = 86_400_000;
  const runs = [
    { startTime: 1 * day, distanceM: 8000 },
    { startTime: 3 * day, distanceM: 16000 },
    { startTime: 9 * day, distanceM: 10000 },
  ];
  it('calcule distance, nombre de séances et plus longue sortie sur la période', () => {
    const t = (id: string) => CHALLENGES.find((c) => c.id === id)!;
    expect(challengeValue(t('duel7'), runs, 0, 7 * day)).toBe(24);
    expect(challengeValue(t('three'), runs, 0, 7 * day)).toBe(2);
    expect(challengeValue(t('long15'), runs, 0, 7 * day)).toBe(16);
  });
  it('classe les joueurs', () => {
    const lb = leaderboard(CHALLENGES[0], [
      { userId: 'a', value: 12 },
      { userId: 'b', value: 30 },
    ]);
    expect(lb[0]).toMatchObject({ userId: 'b', rank: 1 });
  });
});
