// Crée le plan côté serveur : le téléphone envoie l'objectif, le serveur calcule
// le plan avec le même moteur. Le client ne peut donc pas s'attribuer un plan
// "facile" avec des séances gonflées en points.

import { adminClient, handle, HttpError, json, requireUser } from '../_shared/supabase.ts';
import { adaptPlanToVma, assessGoal, buildPlan, compareVma, normalizeClockTime, reschedulePlan, type Athlete, type Plan, type PlanRequest } from '../_shared/core/index.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

function ageOf(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  let a = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)) a--;
  return a;
}

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const raw = await req.json();
    if (raw?.action === 'reschedule' || raw?.action === 'adapt') return json(await modify(adminClient(), user.id, raw));
    const body = raw as PlanRequest;
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

const rows = (plan: Plan, planId: string, userId: string) =>
  plan.sessions.map((s) => ({
    id: s.id,
    plan_id: planId,
    user_id: userId,
    week: s.week,
    date: s.date,
    type: s.type,
    title: s.title,
    duration_sec: s.durationSec,
    distance_m: s.distanceM,
    base_points: s.basePoints,
    steps: s.steps,
  }));

/**
 * Modifier un plan existant :
 *  - « reschedule » : nouvelle date de début, tant qu'aucune séance n'a été faite ;
 *  - « adapt » : recalage des allures sur une VMA mesurée, si elle est meilleure que la dernière performance.
 *    Mêmes semaines et mêmes jours : les séances gardent leurs identifiants et leurs validations.
 */
async function modify(db: SupabaseClient, userId: string, body: { action: string; planId?: string; startDate?: string; vma?: number }) {
  const { data: row } = await db.from('plans').select('id, plan, status').eq('id', body.planId ?? '').eq('user_id', userId).maybeSingle();
  if (!row || row.status !== 'active') throw new HttpError(404, 'plan_not_found');
  const plan = row.plan as Plan;
  const today = new Date().toISOString().slice(0, 10);

  if (body.action === 'reschedule') {
    const start = String(body.startDate ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start < today) throw new HttpError(400, 'invalid_start_date');
    if (start > plan.request.goal.eventDate) throw new HttpError(400, 'start_after_event');
    const { count } = await db.from('session_validations').select('session_id', { count: 'exact', head: true }).eq('plan_id', row.id);
    if ((count ?? 0) > 0) throw new HttpError(409, 'plan_already_started');
    const next = reschedulePlan(plan, start);
    await db.from('planned_sessions').delete().eq('plan_id', row.id);
    const { error } = await db.from('planned_sessions').insert(rows(next, row.id, userId));
    if (error) throw error;
    await db.from('plans').update({ plan: next, start_date: start }).eq('id', row.id);
    return { plan: next };
  }

  const vma = Number(body.vma);
  if (!(vma >= 6 && vma <= 26)) throw new HttpError(400, 'invalid_vma');
  const cmp = compareVma(plan, vma);
  if (!cmp.adapt) return { plan, comparison: cmp, adapted: false };
  const next = { ...adaptPlanToVma(plan, vma), vma: { value: vma, date: today } };
  if (next.sessions.map((s) => s.id).join() !== plan.sessions.map((s) => s.id).join()) throw new HttpError(409, 'plan_shape_changed');
  // Mise à jour en place (jamais de suppression : les validations y sont rattachées).
  const { error } = await db.from('planned_sessions').upsert(rows(next, row.id, userId), { onConflict: 'plan_id,id' });
  if (error) throw error;
  await db.from('plans').update({ plan: next, level: next.request.level }).eq('id', row.id);
  return { plan: next, comparison: cmp, adapted: true };
}
