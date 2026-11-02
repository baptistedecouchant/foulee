// Coach IA (Claude). Deux actions :
//  - "enrich" : conseils et nutrition pour chaque séance du plan (sortie JSON validée)
//  - "chat"   : conversation avec le coach, avec le contexte du plan
// La clé ANTHROPIC_API_KEY reste sur le serveur, jamais dans l'app.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { adminClient, handle, HttpError, json, requireUser } from '../_shared/supabase.ts';
import { buildEnrichPrompt, COACH_SYSTEM_PROMPT, goalSummary, planContext, type Plan } from '../_shared/core/index.ts';

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
    const { action, ...body } = await req.json();
    const db = adminClient();

    const { data: planRow } = await db.from('plans').select('id, plan').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!planRow) throw new HttpError(409, 'no_active_plan');
    const plan = planRow.plan as Plan;

    if (action === 'enrich') {
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
      await db.from('plans').update({ ai_enrichment: enrichment }).eq('id', planRow.id);
      return json(enrichment);
    }

    if (action === 'chat') {
      const { messages } = ChatInput.parse(body);
      if (messages.at(-1)!.role !== 'user') throw new HttpError(400, 'last_message_must_be_user');

      // Dernières validations (données Foulée uniquement, pas de flux Strava).
      const { data: recent } = await db
        .from('session_validations')
        .select('session_id, status, feedback, created_at')
        .eq('plan_id', planRow.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const today = new Date().toISOString().slice(0, 10);
      const context = `CONTEXTE DU COUREUR (aujourd'hui : ${today})
Objectif : ${goalSummary(plan)}
Plan : ${planContext(plan)}
Dernières séances validées : ${JSON.stringify(recent ?? [])}`;

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
