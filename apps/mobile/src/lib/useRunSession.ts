// Séance guidée dans l'app : GPS du téléphone (ou simulateur en démo), chronomètre,
// pause/reprise, voix, alertes d'allure, puis construction de l'activité à valider.

import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { haversine, LiveWorkout, type Activity, type LiveEvent, type LiveStep, type PaceStatus, type PlannedSession, type TrackPoint } from '@foulee/core';

export type RunPhase = 'ready' | 'countdown' | 'running' | 'paused' | 'done';

export interface RunView {
  phase: RunPhase;
  countdown: number | null;
  elapsedSec: number;
  distanceM: number;
  /** Allure du moment, lissée sur 20 s (s/km). */
  pace: number | null;
  avgPace: number | null;
  step?: LiveStep;
  next?: LiveStep;
  stepIndex: number;
  stepCount: number;
  stepRatio: number;
  remainingSec?: number;
  remainingM?: number;
  stepPace: number | null;
  paceStatus: PaceStatus;
  gps: 'off' | 'searching' | 'ok' | 'weak' | 'denied';
  message: string | null;
}

/** Points GPS au-delà de cette précision : enregistrés pour le serveur, ignorés pour la distance. */
const MAX_ACCURACY_M = 30;
/** Saut impossible à pied entre deux points : ignoré pour la distance (perte de signal). */
const MAX_SPEED_MS = 12;
const PACE_WINDOW_SEC = 20;

export function useRunSession(session: PlannedSession, opts: { simulate: boolean; voice: boolean }) {
  const engine = useRef(new LiveWorkout(session));
  const [view, setView] = useState<RunView>(() => ({
    phase: 'ready',
    countdown: null,
    elapsedSec: 0,
    distanceM: 0,
    pace: null,
    avgPace: null,
    stepIndex: -1,
    stepCount: engine.current.steps.length,
    stepRatio: 0,
    stepPace: null,
    paceStatus: 'unknown',
    gps: 'off',
    message: null,
  }));

  // État mutable de la course (hors rendu)
  const r = useRef({
    phase: 'ready' as RunPhase,
    elapsed: 0,
    distance: 0,
    track: [] as TrackPoint[],
    window: [] as Array<{ t: number; d: number }>, // (temps actif, distance) pour l'allure glissante
    lastGood: null as TrackPoint | null,
    startedAt: 0,
    simClock: 0,
    simHeading: 0,
    simFactor: 1,
    simPos: { lat: 48.8566, lon: 2.3522 },
    gps: 'off' as RunView['gps'],
    message: null as string | null,
  });
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const say = useCallback(
    (text: string, urgent = false) => {
      r.current.message = text;
      if (!opts.voice) return;
      if (urgent) Speech.stop().catch(() => {});
      Speech.speak(text, { language: 'fr-FR', rate: 1.02 });
    },
    [opts.voice],
  );

  const now = () => (opts.simulate ? r.current.simClock : Date.now());

  const pace = () => {
    const w = r.current.window;
    if (w.length < 2) return null;
    const a = w[0];
    const b = w[w.length - 1];
    const dt = b.t - a.t;
    const dd = b.d - a.d;
    return dt >= 8 && dd > 5 ? dt / (dd / 1000) : null;
  };

  const handleEvents = useCallback(
    (events: LiveEvent[]) => {
      for (const e of events) {
        if (e.type === 'step_start') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          say(e.speech, true);
        } else if (e.type === 'countdown') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          say(e.speech, true);
        } else if (e.type === 'pace_alert') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          say(e.speech);
        } else if (e.type === 'finished') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          say(e.speech, true);
          r.current.phase = 'done';
        } else {
          say(e.speech);
        }
      }
    },
    [say],
  );

  const render = useCallback(() => {
    const s = r.current;
    const w = engine.current;
    const prog = w.stepProgress({ elapsedSec: s.elapsed, distanceM: s.distance });
    setView({
      phase: s.phase,
      countdown: null,
      elapsedSec: s.elapsed,
      distanceM: s.distance,
      pace: pace(),
      avgPace: s.distance > 50 ? s.elapsed / (s.distance / 1000) : null,
      step: w.current,
      next: w.next,
      stepIndex: w.stepIndex,
      stepCount: w.steps.length,
      stepRatio: prog.ratio,
      remainingSec: prog.remainingSec,
      remainingM: prog.remainingM,
      stepPace: w.stepAvgPace({ elapsedSec: s.elapsed, distanceM: s.distance }),
      paceStatus: w.paceStatus,
      gps: s.gps,
      message: s.message,
    });
  }, []);

  /** Nouveau point GPS (réel ou simulé). */
  const onPoint = useCallback((p: TrackPoint) => {
    const s = r.current;
    if (s.phase !== 'running') {
      s.lastGood = null; // pas de distance pendant la pause
      return;
    }
    s.track.push(p);
    const good = p.accuracy == null || p.accuracy <= MAX_ACCURACY_M;
    s.gps = good ? 'ok' : 'weak';
    if (!good) return;
    if (s.lastGood) {
      const d = haversine(s.lastGood, p);
      const dt = (p.t - s.lastGood.t) / 1000;
      if (dt > 0 && d / dt <= MAX_SPEED_MS) s.distance += d;
    }
    s.lastGood = p;
  }, []);

  /** Battement : 1 s réelle (ou virtuelle en simulation). */
  const tick = useCallback(() => {
    const s = r.current;
    if (s.phase !== 'running') return;
    s.elapsed += 1;

    if (opts.simulate) {
      s.simClock += 1000;
      const step = engine.current.current;
      const target = step ? (step.pace.lo + step.pace.hi) / 2 : 360;
      const v = (1000 / (target * s.simFactor)) * (0.95 + Math.random() * 0.1);
      s.simHeading += (Math.random() - 0.5) * 0.25;
      s.simPos.lat += (v * Math.cos(s.simHeading)) / 111_320;
      s.simPos.lon += (v * Math.sin(s.simHeading)) / (111_320 * Math.cos((s.simPos.lat * Math.PI) / 180));
      onPoint({
        t: s.simClock + Math.round((Math.random() - 0.5) * 40),
        lat: s.simPos.lat,
        lon: s.simPos.lon,
        accuracy: 4 + Math.random() * 5,
        cadence: 166 + Math.round(Math.random() * 10),
        hr: 140 + Math.round(Math.random() * 25),
      });
    }

    s.window.push({ t: s.elapsed, d: s.distance });
    while (s.window.length && s.window[0].t < s.elapsed - PACE_WINDOW_SEC) s.window.shift();

    handleEvents(engine.current.update({ elapsedSec: s.elapsed, distanceM: s.distance, paceSecPerKm: pace(), now: now() }));
    render();
  }, [opts.simulate, onPoint, handleEvents, render]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nettoyage
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      watcher.current?.remove();
      Speech.stop().catch(() => {});
      deactivateKeepAwake('run').catch(() => {});
    },
    [],
  );

  /** Démarre le GPS puis le décompte 5-4-3-2-1-GO. */
  const start = useCallback(async () => {
    const s = r.current;
    if (!opts.simulate) {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        s.gps = 'denied';
        render();
        return;
      }
      s.gps = 'searching';
      watcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) =>
          onPoint({
            t: loc.timestamp,
            lat: loc.coords.latitude,
            lon: loc.coords.longitude,
            alt: loc.coords.altitude ?? undefined,
            accuracy: loc.coords.accuracy ?? undefined,
            // Position falsifiée par une app (Android) : transmise au serveur, qui refusera la séance.
            mocked: loc.mocked || undefined,
          }),
      );
    } else {
      s.gps = 'ok';
      s.simClock = Date.now();
    }
    activateKeepAwakeAsync('run').catch(() => {});

    s.phase = 'countdown';
    for (let n = 5; n >= 1; n--) {
      setView((v) => ({ ...v, phase: 'countdown', countdown: n, gps: s.gps }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (opts.voice) Speech.speak(String(n), { language: 'fr-FR' });
      await new Promise((res) => setTimeout(res, 1000));
    }
    setView((v) => ({ ...v, countdown: 0 }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (opts.voice) Speech.speak('Go !', { language: 'fr-FR' });

    s.phase = 'running';
    s.startedAt = now();
    handleEvents(engine.current.start(s.startedAt));
    timer.current = setInterval(tick, opts.simulate ? 200 : 1000);
    render();
  }, [opts.simulate, opts.voice, onPoint, handleEvents, tick, render]); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = useCallback(() => {
    r.current.phase = 'paused';
    r.current.window = [];
    say('Pause.', true);
    render();
  }, [say, render]);

  const resume = useCallback(() => {
    r.current.phase = 'running';
    r.current.lastGood = null;
    say('C’est reparti !', true);
    render();
  }, [say, render]);

  const skip = useCallback(() => {
    const s = r.current;
    handleEvents(engine.current.skip({ elapsedSec: s.elapsed, distanceM: s.distance, paceSecPerKm: pace(), now: now() }));
    render();
  }, [handleEvents, render]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopAll = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    watcher.current?.remove();
    watcher.current = null;
    deactivateKeepAwake('run').catch(() => {});
  };

  /** Termine la séance (même avant la fin du plan) et renvoie l'activité à valider. */
  const finish = useCallback((): Activity | null => {
    const s = r.current;
    stopAll();
    const end = now();
    engine.current.close(end);
    s.phase = 'done';
    render();
    if (s.elapsed < 60 || s.track.length < 10) return null;
    // Blocs non commencés : vides (ils comptent comme non faits).
    const laps = engine.current.steps.map((_, i) => engine.current.laps[i] ?? { start: end, end });
    return {
      source: 'app_gps',
      externalId: `app-${session.id}-${s.startedAt}`,
      sport: 'running',
      startTime: s.track[0]?.t ?? s.startedAt,
      durationSec: s.elapsed,
      distanceM: Math.round(s.distance),
      manual: false,
      deviceName: 'Téléphone',
      track: s.track,
      laps,
    };
  }, [session.id, render]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = useCallback(() => {
    stopAll();
    Speech.stop().catch(() => {});
    r.current.phase = 'done';
  }, []);

  /** Simulation : courir plus vite (< 1) ou plus lentement (> 1) que la cible. */
  const setSimFactor = useCallback((f: number) => {
    r.current.simFactor = f;
  }, []);

  return { view, steps: engine.current.steps, start, pause, resume, skip, finish, cancel, setSimFactor };
}
