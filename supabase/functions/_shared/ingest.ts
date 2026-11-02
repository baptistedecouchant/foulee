// Pipeline unique pour toute activité reçue (Garmin, Strava, Apple Santé, Health Connect…) :
// 1. anti-triche  2. dédoublonnage  3. rapprochement avec la séance prévue
// 4. validation  5. points (journal idempotent, plafond quotidien)

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  analyzeActivity,
  computeLedger,
  evaluateSession,
  isDuplicate,
  isInWindow,
  applyCaps,
  ECONOMY,
  mondayOf,
  sponsoredChallengeOf,
  sponsoredProgress,
  type Earning,
  SOURCE_PRIORITY,
  trackFingerprint,
  type Activity,
  type Plan,
  type PlannedSession,
  type SessionValidation,
} from './core/index.ts';

export interface IngestResult {
  status: 'stored' | 'duplicate' | 'rejected' | 'no_session';
  activityId?: string;
  validation?: SessionValidation;
}

export async function ingestActivity(db: SupabaseClient, userId: string, activity: Activity): Promise<IngestResult> {
  const trust = analyzeActivity(activity);
  const fingerprint = activity.track ? trackFingerprint(activity.track) : null;

  // Trace déjà utilisée (par ce compte ou un autre) → refus.
  if (fingerprint) {
    const { data: same } = await db
      .from('activities')
      .select('id, user_id, source, external_id')
      .eq('track_fingerprint', fingerprint)
      .is('duplicate_of', null)
      .neq('trust_verdict', 'rejected')
      .maybeSingle();
    if (same && !(same.source === activity.source && same.external_id === activity.externalId)) {
      trust.flags.push({ code: 'TIMESTAMPS_INVALID', severity: 'critical', message: 'Cette trace GPS a déjà été envoyée.' });
      trust.verdict = 'rejected';
      trust.trustScore = 0;
    }
  }

  // Même sortie reçue par une autre source (ex. Garmin puis Strava).
  const dayMs = 86_400_000;
  const { data: nearby } = await db
    .from('activities')
    .select('id, source, external_id, start_time, duration_sec')
    .eq('user_id', userId)
    .gte('start_time', new Date(activity.startTime - dayMs).toISOString())
    .lte('start_time', new Date(activity.startTime + dayMs).toISOString())
    .is('duplicate_of', null);
  const twin = (nearby ?? []).find((a) =>
    isDuplicate(activity, {
      ...activity,
      source: a.source,
      startTime: new Date(a.start_time).getTime(),
      durationSec: a.duration_sec,
    }),
  );
  const isWeaker = twin && SOURCE_PRIORITY[activity.source] >= SOURCE_PRIORITY[twin.source as Activity['source']];

  const { data: inserted, error } = await db
    .from('activities')
    .upsert(
      {
        user_id: userId,
        source: activity.source,
        external_id: activity.externalId,
        start_time: new Date(activity.startTime).toISOString(),
        duration_sec: Math.round(activity.durationSec),
        distance_m: Math.round(activity.distanceM),
        manual: activity.manual,
        indoor: activity.indoor ?? false,
        device_name: activity.deviceName,
        track_fingerprint: isWeaker ? null : fingerprint,
        trust_verdict: trust.verdict,
        trust_score: trust.trustScore,
        trust_flags: trust.flags,
        duplicate_of: isWeaker ? twin!.id : null,
      },
      { onConflict: 'source,external_id' },
    )
    .select('id')
    .single();
  if (error) throw error;

  if (isWeaker) return { status: 'duplicate', activityId: inserted.id };

  // Abaisse la confiance du compte en cas de triche avérée ; suspend les récompenses après plusieurs refus.
  if (trust.verdict === 'rejected' && !activity.manual) {
    const { count } = await db
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('trust_verdict', 'rejected')
      .eq('manual', false);
    await db
      .from('profiles')
      .update({ trust_level: Math.max(0, 100 - (count ?? 1) * 25), rewards_suspended: (count ?? 0) >= 3 })
      .eq('id', userId);
  }

  // Rapprochement : séance prévue la plus proche, non encore validée, tous entraînements actifs confondus.
  const { data: planRows } = await db.from('plans').select('id, plan').eq('user_id', userId).eq('status', 'active').order('created_at');
  if (!planRows?.length) return { status: trust.verdict === 'rejected' ? 'rejected' : 'no_session', activityId: inserted.id };

  const { data: doneRows } = await db
    .from('session_validations')
    .select('plan_id, session_id, status, points')
    .in('plan_id', planRows.map((p) => p.id));
  const done = doneRows ?? [];
  const candidates = planRows.flatMap((row) =>
    (row.plan as Plan).sessions
      .filter((s) => isInWindow(s, activity.startTime))
      .filter((s) => !done.some((d) => d.plan_id === row.id && d.session_id === s.id && d.status === 'validee'))
      .map((s) => ({ planId: row.id as string, plan: row.plan as Plan, s })),
  );
  if (!candidates.length) return { status: trust.verdict === 'rejected' ? 'rejected' : 'no_session', activityId: inserted.id };

  const startDay = new Date(activity.startTime).toISOString().slice(0, 10);
  const pick =
    candidates.find((c) => c.s.date === startDay) ??
    candidates.sort((a, b) => Math.abs(a.s.durationSec - activity.durationSec) - Math.abs(b.s.durationSec - activity.durationSec))[0];
  const { planId, plan } = pick;
  const session: PlannedSession = pick.s;

  const validation = evaluateSession(session, activity, trust);

  // Une meilleure exécution remplace une moins bonne, jamais l'inverse.
  const prevRow = done.find((d) => d.plan_id === planId && d.session_id === session.id);
  if (!prevRow || validation.points > prevRow.points) {
    await db.from('session_validations').upsert({
      plan_id: planId,
      session_id: session.id,
      user_id: userId,
      activity_id: inserted.id,
      status: validation.status,
      score: validation.score,
      volume_score: Math.round(validation.volumeScore * 100) / 100,
      intensity_score: Math.round(validation.intensityScore * 100) / 100,
      points: validation.points,
      feedback: validation.feedback,
    });
  }

  await syncLedger(db, userId);
  return { status: trust.verdict === 'rejected' ? 'rejected' : 'stored', activityId: inserted.id, validation };
}

/** Recalcule les points dus et n'insère que les lignes manquantes (idempotent). */
/**
 * Recalcule TOUS les gains en RunCoins de l'utilisateur (séances et semaines de tous ses plans,
 * pubs vérifiées, challenge sponsorisé), applique les plafonds de `ECONOMY`, puis insère ce qui
 * manque dans le journal. Idempotent : peut être rappelé à tout moment sans double paiement.
 */
export async function syncLedger(db: SupabaseClient, userId: string) {
  const { data: profile } = await db.from('profiles').select('rewards_suspended').eq('id', userId).single();
  if (profile?.rewards_suspended) return;

  const earnings: Earning[] = [];

  // Séances et semaines complètes, tous plans non abandonnés
  const { data: plans } = await db.from('plans').select('id, plan').eq('user_id', userId).neq('status', 'abandoned');
  const ids = (plans ?? []).map((p) => p.id);
  const { data: rows } = ids.length ? await db.from('session_validations').select('*').in('plan_id', ids) : { data: [] };
  for (const p of plans ?? []) {
    const validations: Record<string, SessionValidation> = {};
    for (const r of (rows ?? []).filter((x) => x.plan_id === p.id)) {
      validations[r.session_id] = {
        sessionId: r.session_id,
        status: r.status,
        score: Number(r.score),
        volumeScore: Number(r.volume_score),
        intensityScore: Number(r.intensity_score),
        points: r.points,
        feedback: r.feedback,
      };
    }
    earnings.push(...computeLedger(p.plan as Plan, validations, `${p.id}:`));
  }

  // Pubs regardées, vérifiées par Google (fonction ad-reward)
  const { data: ads } = await db.from('ad_views').select('transaction_id, created_at').eq('user_id', userId);
  for (const a of ads ?? []) {
    earnings.push({ kind: 'ad', label: 'Pub regardée', amount: ECONOMY.adReward, date: a.created_at.slice(0, 10), ref: `ad:${a.transaction_id}` });
  }

  // Challenge sponsorisé de la semaine en cours (activités vérifiées uniquement)
  const week = mondayOf(new Date().toISOString().slice(0, 10));
  const challenge = sponsoredChallengeOf(week);
  const { data: acts } = await db
    .from('activities')
    .select('start_time, distance_m')
    .eq('user_id', userId)
    .eq('trust_verdict', 'trusted')
    .is('duplicate_of', null)
    .gte('start_time', new Date(Date.now() - 8 * 86_400_000).toISOString());
  const runs = (acts ?? []).map((a) => ({ startTime: new Date(a.start_time).getTime(), distanceM: a.distance_m }));
  if (sponsoredProgress(challenge, runs, week) >= challenge.target) {
    earnings.push({ kind: 'sponsored', label: `Challenge : ${challenge.title}`, amount: ECONOMY.sponsoredChallenge, date: week, ref: `sp:${week}` });
  }

  const granted = applyCaps(earnings);
  const { data: existing } = await db.from('points_ledger').select('ref').eq('user_id', userId);
  const have = new Set((existing ?? []).map((e) => e.ref));
  const missing = granted.filter((g) => g.granted > 0 && !have.has(g.ref));
  if (missing.length) {
    await db.from('points_ledger').upsert(
      missing.map((g) => ({ user_id: userId, kind: g.kind, label: g.label, points: g.granted, ref: g.ref })),
      { onConflict: 'user_id,kind,ref', ignoreDuplicates: true },
    );
  }
}
