// Coach IA (Claude). Deux actions :
//  - "enrich" : conseils et nutrition pour chaque séance d'un entraînement (sortie JSON validée)
//  - "chat"   : conversation avec le coach, qui connaît TOUT l'historique des séances
// La clé ANTHROPIC_API_KEY reste sur le serveur, jamais dans l'app.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { adminClient, handle, HttpError, json, requireUser } from '../_shared/supabase.ts';
import {
  buildEnrichPrompt,
  COACH_SYSTEM_PROMPT,
  computeStats,
  formatPace,
  goalSummary,
  historyContext,
  levelInfo,
  planContext,
  type HistoryEntry,
  type Plan,
  type SessionValidation,
} from '../_shared/core/index.ts';

const client = new Anthropic(); // lit ANTHROPIC_API_KEY
const MODEL = 'claude-opus-5-5';
// Si un filtre de sécurité refuse une demande (rare pour du coaching), l'API la rejoue
// automatiquement sur le modèle de repli recommandé au lieu de renvoyer un refus.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

const Enrichment = z.object({
  resume: z.string(),
  semaines: z.array(z.object({ n: z.number(), focus: z.string() })),
  seances: z.array(z.object({ id: z.string(), conseil: z.string(), nutrition: z.string() })),
});

const ChatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .min(1)
    .max(30),
});

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const { action, planId, ...body } = await req.json();
    const db = adminClient();

    const { data: planRows } = await db
      .from('plans')
      .select('id, plan, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const active = (planRows ?? []).filter((p) => p.status === 'active');

    if (action === 'enrich') {
      const row = active.find((p) => p.id === planId) ?? active[0];
      if (!row) throw new HttpError(409, 'no_active_plan');
      const plan = row.plan as Plan;

      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        ...FALLBACK,
        output_config: { effort: 'medium', format: betaZodOutputFormat(Enrichment) },
        system: COACH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildEnrichPrompt(plan) }],
      });
      if (response.stop_reason === 'refusal' || !response.parsed_output) throw new HttpError(502, 'coach_unavailable');

      // On ne garde que les textes, rattachés aux séances existantes : l'IA ne peut rien ajouter d'autre.
      const ids = new Set(plan.sessions.map((s) => s.id));
      const out = response.parsed_output;
      const enrichment = {
        resume: out.resume.slice(0, 500),
        weeks: Object.fromEntries(out.semaines.filter((w) => w.n >= 1 && w.n <= plan.weeks.length).map((w) => [w.n, w.focus.slice(0, 200)])),
        sessions: Object.fromEntries(
          out.seances.filter((s) => ids.has(s.id)).map((s) => [s.id, { tip: s.conseil.slice(0, 240), nutrition: s.nutrition.slice(0, 200) }]),
        ),
      };
      await db.from('plans').update({ ai_enrichment: enrichment }).eq('id', row.id);
      return json(enrichment);
    }

    if (action === 'chat') {
      const { messages } = ChatInput.parse(body);
      if (messages.at(-1)!.role !== 'user') throw new HttpError(400, 'last_message_must_be_user');

      // ---- Historique complet : toutes les séances validées ou non, tous entraînements confondus ----
      const ids = (planRows ?? []).map((p) => p.id);
      const { data: vals } = ids.length
        ? await db
            .from('session_validations')
            .select('plan_id, session_id, status, score, volume_score, intensity_score, feedback, activities(source, start_time, duration_sec, distance_m, trust_verdict)')
            .in('plan_id', ids)
        : { data: [] };

      const byPlan = new Map<string, Record<string, SessionValidation>>();
      const history: HistoryEntry[] = [];
      for (const row of planRows ?? []) {
        const plan = row.plan as Plan;
        const mine = (vals ?? []).filter((v) => v.plan_id === row.id);
        byPlan.set(row.id, Object.fromEntries(mine.map((v) => [v.session_id, toValidation(v)])));
        for (const s of plan.sessions) {
          const v = mine.find((x) => x.session_id === s.id);
          if (!v && s.date >= today()) continue; // séance à venir
          const act = (v as { activities?: Record<string, unknown> } | undefined)?.activities as
            | { source: string; duration_sec: number; distance_m: number }
            | undefined;
          const fromStrava = act?.source === 'strava';
          history.push({
            date: s.date,
            objectif: goalSummary(plan),
            seance: s.title,
            type: s.type,
            statut: v ? v.status : 'manquee',
            score: v ? Number(v.score) : undefined,
            allures_respectees_pct: v ? Math.round(Number(v.intensity_score) * 100) : undefined,
            volume_respecte_pct: v ? Math.round(Number(v.volume_score) * 100) : undefined,
            // Données d'activité Strava exclues (conditions de l'API Strava).
            distance_km: act && !fromStrava ? Math.round(act.distance_m / 100) / 10 : undefined,
            duree_min: act && !fromStrava ? Math.round(act.duration_sec / 60) : undefined,
            allure_moy: act && !fromStrava && act.distance_m > 0 ? formatPace(act.duration_sec / (act.distance_m / 1000)) : undefined,
            remarque: v?.feedback,
          });
        }
      }

      const stats = computeStats(
        (planRows ?? []).map((r) => ({ plan: r.plan as Plan, validations: byPlan.get(r.id) ?? {} })),
        today(),
      );
      const lvl = levelInfo(stats.xp);

      const context = `CONTEXTE DU COUREUR (aujourd'hui : ${today()})
Niveau ${lvl.level} (${lvl.title}), série en cours : ${stats.streak} séances.
Entraînements en cours :
${active.map((r) => `- ${goalSummary(r.plan as Plan)} : ${planContext(r.plan as Plan)}`).join('\n') || 'aucun'}

${historyContext(history, {
  seances_validees: stats.sessionsDone,
  km: stats.distanceKm,
  heures: stats.hours,
  semaines_completes: stats.weeksComplete,
  meilleure_serie: stats.bestStreak,
  activites_refusees: stats.refused,
})}`;

      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        ...FALLBACK,
        output_config: { effort: 'low' },
        system: [
          // Bloc stable mis en cache, puis contexte du coureur.
          { type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: context },
        ],
        messages,
      });
      if (response.stop_reason === 'refusal') {
        return json({ reply: "Je ne peux pas t'aider sur ce point. Parlons de ton entraînement !" });
      }
      const reply = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n');
      return json({ reply });
    }

    throw new HttpError(400, 'unknown_action');
  }),
);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toValidation(v: Record<string, unknown>): SessionValidation {
  return {
    sessionId: v.session_id as string,
    status: v.status as SessionValidation['status'],
    score: Number(v.score),
    volumeScore: Number(v.volume_score),
    intensityScore: Number(v.intensity_score),
    points: 0,
    feedback: (v.feedback as string) ?? '',
  };
}
