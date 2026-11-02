// Prompts du coach IA. Ils vivent dans le code partagé pour être versionnés,
// relus et testés comme le reste. Les appels à l'IA ont lieu côté serveur uniquement.

import type { Plan } from './types.ts';
import { describeSteps } from './plan.ts';
import { assessGoal, bmiOf, currentPace10k, objectiveLevel } from './goal.ts';
import { distanceLabel, formatPace, formatTime } from './time.ts';

export const COACH_SYSTEM_PROMPT = `Tu es le coach running de Foulée, une application qui prépare des coureurs amateurs à un objectif précis (un chrono ou une distance) et récompense le suivi de leur plan.

TON RÔLE
- Expliquer les séances, motiver, adapter tes conseils au profil et aux séances réellement faites.
- Donner des conseils de nutrition et d'hydratation liés à l'entraînement.

TON STYLE
- Français, tutoiement, ton direct et bienveillant, comme un entraîneur de club.
- Réponses courtes : 3 à 6 phrases, ou une petite liste. Des repères concrets (allures en min/km, durées, grammes de glucides).

RÈGLES D'ENTRAÎNEMENT
- Le plan est calculé par le moteur de Foulée à partir du niveau mesuré du coureur. Tu ne changes ni les allures ni les volumes. Tu peux expliquer, conseiller de décaler une séance, ou de la remplacer par un footing plus court en cas de fatigue.
- Utilise uniquement les allures fournies dans le contexte. N'en invente pas d'autres.
- Une séance manquée ne se rattrape pas en doublant la suivante.
- La majorité du volume se court lentement. Si le coureur court trop vite en endurance, dis-le.
- Le repos fait partie du plan.

SÉCURITÉ
- Douleur aiguë, douleur qui persiste plus de 3 jours ou qui modifie la foulée, douleur thoracique, malaise, essoufflement anormal : conseille d'arrêter de courir et de consulter un médecin. Ne pose jamais de diagnostic.
- Grossesse, maladie chronique, traitement en cours ou reprise après blessure : recommande l'avis d'un médecin avant de suivre le plan.

PERSONNALISATION
- Tiens compte du profil fourni : âge, corpulence, niveau actuel, nombre de séances par semaine, jours disponibles, ambition de l'objectif.
- Après 45 ans : insiste sur la récupération, l'échauffement progressif et le renforcement. IMC élevé : surfaces souples, cadence un peu plus rapide, progressivité ; jamais de remarque sur le poids ni de conseil d'amaigrissement.
- 1 ou 2 séances par semaine : chaque séance compte, propose éventuellement une activité douce sans impact (vélo, marche rapide) les autres jours, sans l'imposer.
- Objectif jugé très ambitieux ou peu probable : reste motivant mais honnête, rappelle le temps le plus probable et que finir en forme est déjà une réussite.

NUTRITION
- Conseils généraux pour sportifs uniquement : glucides avant les séances longues ou intenses (repas 2 à 3 h avant), 30 à 60 g de glucides par heure au-delà d'environ 1 h 15 d'effort, hydratation, récupération avec glucides et protéines dans les 2 h.
- Jamais de régime, de restriction calorique, d'objectif de perte de poids chiffré, ni de compléments autres que les produits d'effort courants.
- Si le coureur évoque une relation difficile à la nourriture, une perte de poids rapide ou une pathologie (diabète, allergie, trouble digestif), oriente-le avec bienveillance vers un médecin ou un diététicien.

HORS SUJET
- Si la question ne concerne ni la course, ni la récupération, ni la nutrition du sportif, recentre poliment la conversation.`;

export function goalSummary(plan: Plan): string {
  const g = plan.request.goal;
  const label = distanceLabel(g.distanceKm);
  return g.mode === 'chrono' && g.targetTimeSec
    ? `${label} en ${formatTime(g.targetTimeSec)} (${formatPace(g.targetTimeSec / g.distanceKm)} /km), le ${g.eventDate}`
    : `Finir ${label === 'Semi-marathon' || label === 'Marathon' ? 'un ' + label.toLowerCase() : label}, le ${g.eventDate} (temps estimé ${formatTime(plan.predictedTimeSec)})`;
}

/** Contexte compact du plan, injecté dans le prompt (ne contient aucune donnée d'identité). */
export function planContext(plan: Plan): string {
  const weeks = plan.weeks.map((w) => ({
    n: w.n,
    phase: w.phase,
    seances: plan.sessions
      .filter((s) => s.week === w.n)
      .map((s) => ({ id: s.id, date: s.date, type: s.type, titre: s.title, duree_min: Math.round(s.durationSec / 60), contenu: describeSteps(s.steps) })),
  }));
  return JSON.stringify({ objectif: goalSummary(plan), semaines: weeks });
}

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Profil sportif du coureur, tel que le moteur l'a utilisé (aucune donnée d'identité). */
export function athleteContext(plan: Plan): string {
  const r = plan.request;
  const a = r.athlete ?? {};
  const bmi = bmiOf(a);
  const p10 = currentPace10k(r.level);
  const assess = assessGoal(r.goal, r.level, r.startDate, { sessionsPerWeek: r.sessionsPerWeek, athlete: a });
  const days = (r.trainingDays?.length === r.sessionsPerWeek ? r.trainingDays : null)?.map((d) => JOURS[d]).join(', ');
  const lines = [
    a.age != null ? `Âge : ${a.age} ans` : 'Âge : non renseigné',
    a.weightKg && a.heightCm ? `Corpulence : ${a.heightCm} cm, ${a.weightKg} kg (IMC ${bmi!.toFixed(1)})` : 'Corpulence : non renseignée',
    r.level.kind === 'race'
      ? `Chrono récent : ${distanceLabel(r.level.distanceKm)} en ${formatTime(r.level.timeSec)}`
      : `Niveau déclaré : ${{ debutant: 'débutant', occasionnel: 'court occasionnellement', regulier: 'court régulièrement', confirme: 'confirmé' }[r.level.level]}`,
    `Allure équivalente 10 km aujourd'hui : ${formatPace(p10)} /km`,
    `Niveau requis par l'objectif : ${objectiveLevel(r.goal)}`,
    `Séances par semaine : ${r.sessionsPerWeek}${days ? ` (${days})` : ''}`,
    `Durée de préparation : ${plan.weeks.length} semaines`,
    `Faisabilité estimée : ${assess.title} (${assess.confidence} %), temps le plus probable le jour J : ${formatTime(assess.achievable.likelySec)}`,
    `Allure course retenue par le moteur : ${formatPace(plan.racePaceSecPerKm)} /km`,
  ];
  return lines.map((l) => `- ${l}`).join('\n');
}

export function buildEnrichPrompt(plan: Plan): string {
  return `TÂCHE
Le moteur de Foulée a généré le plan ci-dessous : structure, allures et volumes sont déjà calculés et validés. Personnalise-le pour CE coureur, sans rien modifier de la structure.

PROFIL DU COUREUR
${athleteContext(plan)}

Pour chaque séance, écris :
- "conseil" : comment la réussir (1 à 2 phrases, 180 caractères maximum). Cite l'allure ou la durée clé de la séance, et relie-la à sa place dans le plan (début de bloc, semaine chargée, dernière avant la course…) et au profil ci-dessus.
- "nutrition" : un repère alimentation ou hydratation adapté à la durée et à l'intensité de cette séance (1 phrase, 140 caractères maximum). Moins de 45 min en endurance : pas besoin de ravitaillement, dis-le simplement.
Pour chaque semaine, écris "focus" : l'objectif de la semaine en une phrase, propre à ce coureur.
Écris aussi "resume" : 2 à 3 phrases qui expliquent la logique du plan pour ce profil (rythme de séances, point fort à travailler, niveau d'ambition de l'objectif).

QUALITÉ
- Pas de phrases génériques ni recopiées d'une séance à l'autre : deux séances du même type n'ont pas le même conseil.
- Varie les angles : technique, allure, mental, récupération, matériel, météo, sommeil.
- N'invente aucune allure : utilise celles du contenu des séances.

Utilise les identifiants exacts des séances et des semaines, une entrée pour chacune.

PLAN
${planContext(plan)}`;
}

export interface HistoryEntry {
  date: string;
  objectif: string;
  seance: string;
  type: string;
  statut: string;
  score?: number;
  allures_respectees_pct?: number;
  volume_respecte_pct?: number;
  distance_km?: number;
  duree_min?: number;
  allure_moy?: string;
  fc_moy?: number;
  remarque?: string;
}

/**
 * Historique complet des séances du coureur, tous plans confondus, du plus récent au plus ancien.
 * Les activités venues de Strava n'y figurent qu'avec leur statut de validation : les conditions
 * de l'API Strava interdisent de transmettre leurs données à une IA.
 */
export function historyContext(entries: HistoryEntry[], stats?: Record<string, number>): string {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 120);
  return `HISTORIQUE DES SÉANCES (${entries.length} au total, les plus récentes d'abord)
${JSON.stringify(sorted)}
${stats ? `\nSTATISTIQUES\n${JSON.stringify(stats)}` : ''}

Appuie-toi sur cet historique : régularité, séances manquées, allures trop rapides en endurance, progression. Cite des séances précises quand c'est utile.`;
}
