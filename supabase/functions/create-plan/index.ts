// Crée le plan côté serveur : le téléphone envoie l'objectif, le serveur calcule
// le plan avec le même moteur. Le client ne peut donc pas s'attribuer un plan
// "facile" avec des séances gonflées en points.

import { adminClient, handle, HttpError, json, requireUser } from '../_shared/supabase.ts';
import { assessGoal, buildPlan, type PlanRequest } from '../_shared/core/index.ts';

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
    if (![2, 3, 4, 5].includes(body.sessionsPerWeek)) throw new HttpError(400, 'invalid_sessions');

    const assessment = assessGoal(g, body.level, body.startDate);
    if (assessment.feasibility === 'delai_court') throw new HttpError(422, 'not_enough_weeks');
    if (assessment.weeks > 24) throw new HttpError(422, 'too_many_weeks');

    const plan = buildPlan(body);
    const db = adminClient();

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
