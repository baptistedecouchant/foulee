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

  it('10 km en 45 min depuis 49:30 en 10 semaines : exigeant à 4 séances, plus dur à 2', () => {
    const a = assessGoal(tenK45.goal, tenK45.level, START, { sessionsPerWeek: 4 });
    expect(a.weeks).toBe(10);
    expect(a.feasibility).toBe('exigeant');
    const b = assessGoal(tenK45.goal, tenK45.level, START, { sessionsPerWeek: 2 });
    expect(['tres_ambitieux', 'peu_probable']).toContain(b.feasibility);
    expect(b.confidence).toBeLessThan(a.confidence);
  });

  it('l’âge et la corpulence réduisent la progression attendue', () => {
    const jeune = assessGoal(tenK45.goal, tenK45.level, START, { sessionsPerWeek: 4, athlete: { age: 28, weightKg: 70, heightCm: 178 } });
    const senior = assessGoal(tenK45.goal, tenK45.level, START, { sessionsPerWeek: 4, athlete: { age: 58, weightKg: 98, heightCm: 175 } });
    expect(senior.confidence).toBeLessThan(jeune.confidence);
    expect(senior.achievable.likelySec).toBeGreaterThan(jeune.achievable.likelySec);
  });

  it('propose trois chronos (prudent, réaliste, ambitieux) et le niveau requis', () => {
    const a = assessGoal(tenK45.goal, tenK45.level, START, { sessionsPerWeek: 3 });
    expect(a.suggestions.map((x) => x.label)).toEqual(['Prudent', 'Réaliste', 'Ambitieux']);
    expect(a.suggestions[0].timeSec).toBeGreaterThan(a.suggestions[2].timeSec);
    expect(a.level).toBe('intermédiaire');
  });

  it('propose un temps réaliste quand le chrono visé est hors de portée', () => {
    const a = assessGoal({ ...tenK45.goal, targetTimeSec: 38 * 60 }, tenK45.level, START);
    expect(a.feasibility).toBe('peu_probable');
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
    expect(['realiste', 'tres_probable']).toContain(a.feasibility);
  });

  it('accepte une séance par semaine et des jours choisis', () => {
    const p = buildPlan({ ...tenK45, sessionsPerWeek: 1, trainingDays: [5] });
    expect(p.sessions.filter((s) => s.week === 1)).toHaveLength(1);
    expect(p.sessions.at(-1)!.type).toBe('race');
    const q = buildPlan({ ...tenK45, sessionsPerWeek: 3, trainingDays: [0, 2, 5] });
    const w1 = q.sessions.filter((s) => s.week === 1).map((s) => s.date);
    expect(w1).toEqual(['2026-11-02', '2026-11-04', '2026-11-07']);
  });

  it('un objectif irréaliste ne fait pas s’entraîner à une allure impossible', () => {
    const p = buildPlan({ ...tenK45, goal: { ...tenK45.goal, targetTimeSec: 36 * 60 } });
    expect(p.racePaceSecPerKm).toBeGreaterThan(36 * 6);
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
    expect(v.points).toBe(ECONOMY.sessionValidated);
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

import { BADGE_XP, BADGES, computeStats, levelInfo, weeklyQuests, xpForLevel } from '../src/index.ts';

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
    // Premier pas (bronze), Sur ta lancée ? non (4 séances), Semaine bouclée (bronze), Métronome (argent)
    expect(stats.badgeXp).toBe(BADGE_XP.bronze * 2 + BADGE_XP.argent);
    expect(stats.weekStreak).toBe(1);
  });

  it('compte les semaines d’affilée avec au moins une séance', () => {
    const one = (w: number) => plan.sessions.find((s) => s.week === w)!;
    const validations = Object.fromEntries([1, 2, 3, 5].map((w) => [one(w).id, v(one(w).id)]));
    const stats = computeStats([{ plan, validations }], one(5).date);
    expect(stats.bestWeekStreak).toBe(3);
    expect(stats.weekStreak).toBe(1);
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

import { applyCaps, ECONOMY, sponsoredChallengeOf, sponsoredProgress, weeklyRoom, type Earning } from '../src/index.ts';

describe('économie RunCoin', () => {
  const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`; // 2 nov. 2026 = lundi
  const session = (d: number, n = 0): Earning => ({ kind: 'session', label: 's', amount: ECONOMY.sessionValidated, date: day(d), ref: `s${d}-${n}` });
  const ad = (d: number, n: number): Earning => ({ kind: 'ad', label: 'pub', amount: ECONOMY.adReward, date: day(d), ref: `a${d}-${n}` });

  it('une seule séance payée par jour, 4 par semaine', () => {
    const g = applyCaps([session(2), session(2, 1), session(3), session(4), session(5), session(6), session(7)]);
    expect(g.filter((x) => x.granted > 0)).toHaveLength(4);
    expect(g[1].granted).toBe(0);
  });

  it('plafonne les pubs par jour et par semaine', () => {
    const ads = [2, 3, 4, 5].flatMap((d) => [0, 1, 2, 3, 4].map((n) => ad(d, n)));
    const g = applyCaps(ads);
    expect(g.filter((x) => x.date === day(2) && x.granted > 0)).toHaveLength(ECONOMY.caps.adsPerDay);
    expect(g.filter((x) => x.granted > 0)).toHaveLength(ECONOMY.caps.adsPerWeek);
  });

  it('un utilisateur qui fait tout au maximum ne dépasse pas 6 000 RC (6 €) en 2 mois ni 150 RC d’activité par jour', () => {
    const all: Earning[] = [];
    for (let i = 0; i < 59; i++) { // du 2 novembre au 30 décembre : 2 mois calendaires
      const dt = new Date(2026, 10, 2 + i, 12);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      all.push({ kind: 'session', label: 's', amount: ECONOMY.sessionValidated, date: iso, ref: `s${i}` });
      for (let n = 0; n < 10; n++) all.push({ kind: 'ad', label: 'a', amount: ECONOMY.adReward, date: iso, ref: `a${i}-${n}` });
      if (dt.getDay() === 0) {
        all.push({ kind: 'week', label: 'w', amount: ECONOMY.weekComplete, date: iso, ref: `w${i}` });
        all.push({ kind: 'sponsored', label: 'p', amount: ECONOMY.sponsoredChallenge, date: iso, ref: `p${i}` });
        all.push({ kind: 'sponsored', label: 'p2', amount: ECONOMY.sponsoredChallenge, date: iso, ref: `p${i}b` });
      }
    }
    const g = applyCaps(all);
    const total = g.reduce((a, x) => a + x.granted, 0);
    expect(total).toBeLessThanOrEqual(2 * ECONOMY.caps.monthlyTotal);
    const perDay = new Map<string, number>();
    for (const x of g) if (x.kind === 'session' || x.kind === 'ad') perDay.set(x.date, (perDay.get(x.date) ?? 0) + x.granted);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(ECONOMY.caps.activityPerDay);
  });

  it('un utilisateur assidu (3 séances/sem) gagne environ 5 € (≈ 4 800 RC) en 2 mois', () => {
    const all: Earning[] = [];
    for (let w = 0; w < 8; w++) {
      for (const d of [1, 3, 6]) {
        const dt = new Date(2026, 10, 2 + w * 7 + d, 12);
        const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        all.push({ kind: 'session', label: 's', amount: ECONOMY.sessionValidated, date: iso, ref: `s${w}${d}` });
        if (d === 6) {
          all.push({ kind: 'week', label: 'w', amount: ECONOMY.weekComplete, date: iso, ref: `w${w}` });
          all.push({ kind: 'ad', label: 'a', amount: ECONOMY.adReward, date: iso, ref: `a${w}` });
          if (w % 2 === 0) all.push({ kind: 'sponsored', label: 'p', amount: ECONOMY.sponsoredChallenge, date: iso, ref: `p${w}` });
        }
      }
    }
    const total = applyCaps(all).reduce((a, g) => a + g.granted, 0);
    expect(total).toBeGreaterThanOrEqual(4000);
    expect(total).toBeLessThanOrEqual(5500);
  });

  it('indique ce qu’il reste à gagner et le challenge sponsorisé de la semaine', () => {
    const g = applyCaps([session(2), ad(2, 0)]);
    expect(weeklyRoom(g, day(2))).toMatchObject({ earned: ECONOMY.sessionValidated + ECONOMY.adReward, adsLeftToday: ECONOMY.caps.adsPerDay - 1 });
    const c = sponsoredChallengeOf('2026-11-02');
    expect(sponsoredChallengeOf('2026-11-02').id).toBe(c.id);
    expect(sponsoredProgress(c, [{ startTime: new Date(2026, 10, 3).getTime(), distanceM: 12500 }], '2026-11-02')).toBeGreaterThan(0);
  });
});

import { chestEarnings, loginStreak, tipOfDay } from '../src/index.ts';

describe('connexion quotidienne et bienvenue', () => {
  const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
  it('compte la série et la remet à zéro après un jour manqué', () => {
    expect(loginStreak(days, '2026-11-08')).toBe(8);
    expect(loginStreak(days, '2026-11-09')).toBe(8); // pas encore ouvert aujourd'hui
    expect(loginStreak(days, '2026-11-10')).toBe(0);
  });
  it('ouvre un coffre tous les 7 jours d’affilée', () => {
    const c = chestEarnings(days);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ date: '2026-11-07', amount: ECONOMY.streakChest });
  });
  it('le bonus de bienvenue ne se touche qu’une fois', () => {
    const g = applyCaps([
      { kind: 'welcome', label: 'b', amount: ECONOMY.welcomeBonus, date: '2026-11-02', ref: 'welcome' },
      { kind: 'welcome', label: 'b', amount: ECONOMY.welcomeBonus, date: '2026-11-03', ref: 'welcome2' },
    ]);
    expect(g.reduce((a, x) => a + x.granted, 0)).toBe(ECONOMY.welcomeBonus);
  });
  it('donne une astuce stable pour la journée', () => {
    expect(tipOfDay('2026-11-02').id).toBe(tipOfDay('2026-11-02').id);
  });
});

import { parseGoalTime } from '../src/index.ts';

describe('saisie du temps visé', () => {
  it('comprend les formats courants', () => {
    expect(parseGoalTime('45:00', 10)).toBe(2700);
    expect(parseGoalTime('45', 10)).toBe(2700);
    expect(parseGoalTime(' 44:30 ', 10)).toBe(2670);
    expect(parseGoalTime("44'30", 10)).toBe(2670);
    expect(parseGoalTime('1:45:00', 21.0975)).toBe(6300);
    expect(parseGoalTime('1h45', 21.0975)).toBe(6300);
    expect(parseGoalTime('1H45', 21.0975)).toBe(6300);
    expect(parseGoalTime("1h45'", 21.0975)).toBe(6300);
    expect(parseGoalTime('3h', 42.195)).toBe(10800);
    expect(parseGoalTime('1h45:30', 21.0975)).toBe(6330);
  });
  it('« 1:45 » sur un semi = 1 h 45', () => {
    expect(parseGoalTime('1:45', 21.0975)).toBe(6300);
    expect(parseGoalTime('3:59', 42.195)).toBe(14340);
  });
  it('refuse les saisies invalides', () => {
    for (const bad of ['', 'abc', '45:75', '1h75', '1:2:3:4', ':']) expect(parseGoalTime(bad, 10)).toBeNull();
  });
});

import { assignRuns, raceWeekGuide, RACE_CALENDAR, searchRaces, shoeWear, normalizeClockTime, SHOE_CATALOG, type RunLog, type Shoe } from '../src/index.ts';

describe('chaussures', () => {
  const shoe: Shoe = { id: 'a', brand: 'Nike', model: 'Pegasus', lifeKm: 700, startKm: 100, since: '2026-11-01' };
  const runs: RunLog[] = [
    { id: 'r0', date: '2026-10-30', distanceKm: 8, durationSec: 2400, source: 'app' },
    { id: 'r1', date: '2026-11-02', distanceKm: 10, durationSec: 3000, source: 'app' },
    { id: 'r2', date: '2026-11-04', distanceKm: 12.4, durationSec: 3800, source: 'strava' },
  ];
  it('attribue les nouvelles courses à la paire par défaut, sans toucher l’historique', () => {
    const a = assignRuns(runs, {}, [shoe], 'a');
    expect(a).toEqual({ r1: 'a', r2: 'a' });
    expect(assignRuns(runs, a, [shoe, { ...shoe, id: 'b' }], 'b')).toBe(a);
  });
  it('calcule les km et l’état', () => {
    const w = shoeWear(shoe, runs, { r1: 'a', r2: 'a' });
    expect(w.km).toBe(122.4);
    expect(w.state).toBe('bonne');
    expect(shoeWear({ ...shoe, startKm: 650 }, runs, { r1: 'a', r2: 'a' }).state).toBe('remplacer');
    expect(shoeWear({ ...shoe, startKm: 700 }, runs, {}).state).toBe('usee');
  });
  it('catalogue : toutes les marques, des durées plausibles', () => {
    for (const b of ['Nike', 'Adidas', 'Puma', 'Asics', 'Kiprun', 'Salomon', 'Brooks', 'On']) expect(SHOE_CATALOG.some((m) => m.brand === b)).toBe(true);
    expect(SHOE_CATALOG.every((m) => m.lifeKm >= 300 && m.lifeKm <= 900)).toBe(true);
  });
});

describe('calendrier des courses', () => {
  it('cherche sans accents, par distance, seulement à venir', () => {
    const r = searchRaces(RACE_CALENDAR, { query: 'tour eiffel', fromIso: '2026-11-05' });
    expect(r[0].name).toContain('Tour Eiffel');
    expect(searchRaces(RACE_CALENDAR, { query: 'elysees', fromIso: '2026-11-05' }).length).toBe(1);
    expect(searchRaces(RACE_CALENDAR, { fromIso: '2026-11-05', distanceKm: 21.1 }).every((e) => e.distances.some((d) => d > 21))).toBe(true);
    expect(searchRaces(RACE_CALENDAR, { fromIso: '2030-01-01' })).toEqual([]);
  });
  it('lit une heure de départ', () => {
    expect(normalizeClockTime('8h')).toBe('08:00');
    expect(normalizeClockTime('8:30')).toBe('08:30');
    expect(normalizeClockTime('25:00')).toBeNull();
  });
});

describe('semaine de course', () => {
  it('marathon : charge glucidique dosée au poids, gels, horaires calés sur le départ', () => {
    const g = raceWeekGuide({ distanceKm: 42.195, expectedSec: 4 * 3600, startTime: '08:30', weightKg: 70 });
    const txt = JSON.stringify(g);
    expect(txt).toContain('J-3');
    expect(txt).toContain('560 g');
    expect(txt).toContain('5 h 30'); // petit-déjeuner 3 h avant
    expect(txt).toMatch(/gels/);
  });
  it('10 km : pas de charge, pas de gel', () => {
    const txt = JSON.stringify(raceWeekGuide({ distanceKm: 10, expectedSec: 3000 }));
    expect(txt).toContain('Pas besoin de charge');
    expect(txt).not.toContain('gel toutes');
  });
});

describe('mots encourageants', () => {
  it('aucun message de faisabilité ne parle de pourcentage à gagner ni d’objectif irréalisable', () => {
    for (const t of [20, 30, 36, 40, 44, 47, 52, 60].map((m) => m * 60))
      for (const n of [1, 3, 5] as const) {
        const a = assessGoal({ ...tenK45.goal, targetTimeSec: t }, tenK45.level, START, { sessionsPerWeek: n });
        expect(`${a.title} ${a.message}`).not.toMatch(/%|gagner|irr[ée]alis|ambitieux|attention|peu probable/i);
      }
  });
});

import { adaptPlanToVma, compareVma, levelFromVma, reschedulePlan, vmaFromSixMinutes, vmaTestSession } from '../src/index.ts';

describe('test VMA', () => {
  const plan = buildPlan(tenK45); // dernière perf : 10 km en 49:30
  it('6 minutes : VMA = distance / 100', () => {
    expect(vmaFromSixMinutes(1300)).toBe(13);
    expect(levelFromVma(15)).toEqual({ kind: 'race', distanceKm: 10, timeSec: Math.round((10 / 13.2) * 3600) });
  });
  it('VMA nettement meilleure : on propose d’adapter, mêmes séances (ids) avec allures plus rapides', () => {
    const c = compareVma(plan, 15.5);
    expect(c.adapt).toBe(true);
    const a = adaptPlanToVma(plan, 15.5);
    expect(a.sessions.map((s) => s.id)).toEqual(plan.sessions.map((s) => s.id));
    expect(a.sessions.map((s) => s.date)).toEqual(plan.sessions.map((s) => s.date));
    const ef = (p: typeof plan) => p.sessions.find((s) => s.type === 'ef')!.steps[0] as { pace: { lo: number } };
    expect(ef(a).pace.lo).toBeLessThan(ef(plan).pace.lo);
  });
  it('VMA équivalente ou moins bonne : pas d’adaptation', () => {
    expect(compareVma(plan, 13.8).adapt).toBe(false);
    expect(compareVma(plan, 12).adapt).toBe(false);
  });
  it('séance de test et décalage du début', () => {
    const t = vmaTestSession(plan, '2026-11-03');
    expect(t.durationSec).toBeGreaterThan(30 * 60);
    const r = reschedulePlan(plan, '2026-11-09');
    expect(r.sessions[0].date >= '2026-11-09').toBe(true);
    expect(r.sessions.at(-1)!.date).toBe(plan.sessions.at(-1)!.date);
  });
});
