// Crée le plan côté serveur : le téléphone envoie l'objectif, le serveur calcule
// le plan avec le même moteur. Le client ne peut donc pas s'attribuer un plan
// "facile" avec des séances gonflées en points.

import { adminClient, handle, HttpError, json, requireUser } from '../_shared/supabase.ts';
import { assessGoal, buildPlan, normalizeClockTime, type Athlete, type PlanRequest } from '../_shared/core/index.ts';

function ageOf(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  let a = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)) a--;
  return a;
}

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const body = (await req.json()) as PlanRequest;
    const g = body.goal;

    if (!g || !['chrono', 'distance'].includes(g.mode)) throw new HttpError(400, 'invalid_goal');
    if (!(g.distanceKm > 0 && g.distanceKm <= 100)) throw new HttpError(400, 'invalid_distance');
    if (g.mode === 'chrono') {
      const pace = (g.targetTimeSec ?? 0) / g.distanceKm;
      if (!(pace >= 150 && pace <= 720)) throw new HttpError(400, 'invalid_target_time');
    }
    // Course officielle visée : on ne garde que des champs simples et bornés.
    const r = g.race as { name?: unknown; city?: unknown; startTime?: unknown } | undefined;
    g.race =
      r && typeof r.name === 'string' && r.name.trim()
        ? {
            name: r.name.trim().slice(0, 80),
            city: typeof r.city === 'string' && r.city.trim() ? r.city.trim().slice(0, 40) : undefined,
            startTime: typeof r.startTime === 'string' ? (normalizeClockTime(r.startTime) ?? undefined) : undefined,
          }
        : undefined;
    if (![1, 2, 3, 4, 5].includes(body.sessionsPerWeek)) throw new HttpError(400, 'invalid_sessions');
    const days = Array.isArray(body.trainingDays) ? [...new Set(body.trainingDays.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort() : undefined;
    const trainingDays = days && days.length === body.sessionsPerWeek ? days : undefined;

    // Profil sportif lu sur le serveur (âge, poids, taille) : il ajuste la charge et l'estimation.
    const db = adminClient();
    const { data: prof } = await db.from('profiles').select('birth_date, weight_kg, height_cm').eq('id', user.id).maybeSingle();
    const athlete: Athlete = {
      age: prof?.birth_date ? ageOf(prof.birth_date) : undefined,
      weightKg: prof?.weight_kg ? Number(prof.weight_kg) : undefined,
      heightCm: prof?.height_cm ?? undefined,
    };

    // On ne bloque jamais un objectif ambitieux : on prévient et le plan reste prudent.
    const assessment = assessGoal(g, body.level, body.startDate, { sessionsPerWeek: body.sessionsPerWeek, athlete });
    if (assessment.weeks > 30) throw new HttpError(422, 'too_many_weeks');

    const plan = buildPlan({ goal: g, level: body.level, sessionsPerWeek: body.sessionsPerWeek, startDate: body.startDate, trainingDays, athlete });

    const { count } = await db.from('plans').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active');
    if ((count ?? 0) >= 3) throw new HttpError(409, 'too_many_active_plans');
    const { data: row, error } = await db
      .from('plans')
      .insert({
        user_id: user.id,
        goal_mode: g.mode,
        distance_km: g.distanceKm,
        target_time_sec: g.mode === 'chrono' ? g.targetTimeSec : null,
        event_date: g.eventDate,
        start_date: body.startDate,
        sessions_per_week: body.sessionsPerWeek,
        training_days: trainingDays ?? null,
        level: body.level,
        plan,
        title: typeof (body as { title?: string }).title === 'string' ? (body as { title?: string }).title!.slice(0, 60) : null,
      })
      .select('id')
      .single();
    if (error) throw error;

    await db.from('planned_sessions').insert(
      plan.sessions.map((s) => ({
        id: s.id,
        plan_id: row.id,
        user_id: user.id,
        week: s.week,
        date: s.date,
        type: s.type,
        title: s.title,
        duration_sec: s.durationSec,
        distance_m: s.distanceM,
        base_points: s.basePoints,
        steps: s.steps,
      })),
    );

    return json({ planId: row.id, plan, assessment });
  }),
);
