# Paramètres de Foulée

Ce fichier liste tous les réglages de l'application, composant par composant : la valeur actuelle, à quoi elle sert et le fichier où la modifier. Pour changer un comportement, change la valeur dans le fichier indiqué puis lance `npm test`. Les tests préviennent si un réglage casse quelque chose.

Sommaire :
1. [Identité de l'app et stores](#1-identité-de-lapp-et-stores)
2. [Variables d'environnement et secrets](#2-variables-denvironnement-et-secrets)
3. [Objectifs et faisabilité](#3-objectifs-et-faisabilité)
4. [Génération des plans](#4-génération-des-plans)
5. [Zones d'allure](#5-zones-dallure)
6. [Séances types](#6-séances-types)
7. [Validation des séances et points](#7-validation-des-séances-et-points)
8. [Anti-triche GPS et capteurs](#8-anti-triche-gps-et-capteurs)
9. [Dédoublonnage des sources](#9-dédoublonnage-des-sources)
10. [Séance guidée en direct (GPS + voix)](#10-séance-guidée-en-direct-gps--voix)
11. [Nutrition et échauffement](#11-nutrition-et-échauffement)
12. [Gamification : XP, niveaux, série, badges, défis de la semaine](#12-gamification)
13. [Hub social et défis entre joueurs](#13-hub-social-et-défis-entre-joueurs)
14. [Récompenses et boutique](#14-récompenses-et-boutique)
15. [Coach IA](#15-coach-ia)
16. [Intégrations (Strava, Garmin, Apple, Health Connect)](#16-intégrations)
17. [Base de données et sécurité serveur](#17-base-de-données-et-sécurité-serveur)
18. [Design : couleurs, dégradés, espacements](#18-design)
19. [Photos](#19-photos)
20. [Mode démo](#20-mode-démo)

---

## 1. Identité de l'app et stores

Fichier : `apps/mobile/app.json`

| Paramètre | Valeur | Rôle |
|---|---|---|
| `name` | Foulée | Nom affiché sous l'icône |
| `slug` | foulee | Identifiant du projet Expo |
| `version` | 1.0.0 | Version visible dans les stores |
| `scheme` | foulee | Liens profonds (`foulee://…`), retour de la connexion Strava |
| `ios.bundleIdentifier` | app.foulee.mobile | Identifiant App Store (**à remplacer** par le domaine de ta société) |
| `android.package` | app.foulee.mobile | Identifiant Google Play (idem) |
| `ios.supportsTablet` | false | iPhone uniquement |
| `orientation` | portrait | |
| `userInterfaceStyle` | automatic | Suit le mode clair ou sombre du téléphone |
| `ios.infoPlist.NSHealthShareUsageDescription` | « Foulée lit tes séances… » | Texte de la demande d'accès à Santé |
| `ios.infoPlist.NSLocationWhenInUseUsageDescription` | « Foulée utilise ta position pendant une séance… » | Texte de la demande d'accès au GPS |
| `android.permissions` | ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION | GPS pendant les séances |
| `android.blockedPermissions` | ACCESS_BACKGROUND_LOCATION | GPS en arrière-plan bloqué (pas encore utilisé) |
| plugin `expo-location` | arrière-plan désactivé (iOS et Android) | À activer avec le premier build installé |
| `experiments.reactCompiler` | true | Optimisation automatique des rendus |

Builds et publication : `apps/mobile/eas.json`

| Profil | Usage |
|---|---|
| `development` | App de développement installée sur ton téléphone (nécessaire pour Apple Santé, Health Connect, GPS en arrière-plan) |
| `preview` | Version de test à partager (canal `preview`) |
| `production` | Version stores, numéro de build incrémenté automatiquement (canal `production`) |

## 2. Variables d'environnement et secrets

**App** : `apps/mobile/.env` (modèle : `.env.example`)

| Variable | Rôle | Si absente |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Adresse du serveur | Mode démo |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clé publique du serveur | Mode démo |

**Serveur** : `supabase/.env` (modèle : `.env.example`), envoyé avec `npx supabase secrets set --env-file supabase/.env`

| Secret | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Coach IA (Claude) |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | Application Strava |
| `STRAVA_VERIFY_TOKEN` | Mot de passe de l'abonnement webhook Strava (au choix) |
| `APP_INTEGRITY_ENFORCED` | `true` pour exiger l'attestation App Attest / Play Integrity (à finaliser avant la production) |

Ne mets jamais ces secrets dans l'app ni sur GitHub : `.env` est exclu par `.gitignore`.

## 3. Objectifs et faisabilité

Fichier : `packages/core/src/goal.ts`

| Paramètre | Valeur | Rôle |
|---|---|---|
| Types d'objectif | `chrono` (distance + temps) ou `distance` (finir) | |
| Distances proposées | 5 km, 10 km, semi (21,0975), marathon (42,195), autre (1 à 100 km) | Écran `app/goal.tsx` |
| Formule de prédiction | Riegel, exposant **1,06** | Projette un chrono connu sur une autre distance |
| Allure 10 km par niveau déclaré | débutant 7:30, occasionnel 6:30, régulier 5:30, confirmé 4:45 /km | Quand l'utilisateur n'a pas de chrono |
| Gain réaliste max | **1,2 % par semaine**, plafonné à **15 %** | Au-delà : « Trop ambitieux » et proposition d'un chrono réaliste |
| Seuils de verdict | gain ≤ 60 % du max : « réaliste » ; ≤ 100 % : « exigeant » ; au-delà : « trop ambitieux » ; gain ≤ 0 : « déjà à ta portée » | |
| Arrondi du chrono proposé | 15 s supérieures | |
| Semaines minimum | 5 km : 4 · 10 km : 6 · semi : 10 · marathon : 14 ; **+4** si allure 10 km > 7:00/km | Sinon « Délai trop court », création bloquée |
| Durée du plan | 4 à 24 semaines | Écran objectif (sélecteur) et serveur (`create-plan`) |
| Allure possible | 2:30 à 12:00 /km | Validation du temps visé |
| Début du plan | ce lundi si on est lundi ou mardi, sinon lundi suivant | `time.ts` → `suggestedStartDate` |
| Objectifs en parallèle | **3** max | `MAX_ACTIVE_PLANS` dans `lib/store.tsx` et `create-plan` |

## 4. Génération des plans

Fichier : `packages/core/src/plan.ts` → `buildPlan`

| Paramètre | Valeur | Rôle |
|---|---|---|
| Phases | fondations ≈ 30 % des semaines, spécifique ≈ 25 %, affûtage 1 semaine (2 pour un marathon), développement = le reste | Périodisation |
| Volume de départ (min/semaine) | séances × 30 (allure 10 km > 7:00), × 38 (> 6:00), × 45 (> 5:00), × 52 sinon | |
| Progression | **+7 %** par semaine | |
| Plafond de volume | **1,6 ×** le volume de départ | |
| Semaine allégée | toutes les **4** semaines, volume × **0,78** | Récupération |
| Affûtage | avant-dernière semaine × 0,75 (marathon), dernière × **0,55** | |
| Sortie longue | **32 %** du volume, entre 40 min et un plafond : 70 min (5 km), 85 (10 km), 125 (semi), 190 (marathon) ; en affûtage ≤ 60 % du plafond | |
| Footings | reste du volume réparti, entre **30 et 70 min** | |
| Jours d'entraînement (0 = lundi) | 2 séances : mer, dim · 3 : mar, jeu, dim · 4 : mar, jeu, sam, dim · 5 : lun, mar, jeu, sam, dim | `DAY_SETS` |
| Séances par semaine | 2 : qualité + SL · 3 : qualité + seuil (ou accélérations) + SL · 4 : + footing · 5 : + 2 footings | `weekTypes` |
| Séance clé selon la phase | fondations : fartlek · développement : VMA · spécifique et affûtage : allure objectif | |
| Semaine de course | séance courte à allure, footings, accélérations la veille, course le jour J | |
| Allure de progression | les allures passent de ton niveau actuel au niveau de l'objectif, linéairement sur le plan | |
| Objectif distance | progression supposée de 0,5 %/semaine (max 6 %) | |

## 5. Zones d'allure

Fichier : `plan.ts` → `zonesFor`. Base = ton allure 10 km du moment (en s/km).

| Zone | Fourchette | Usage |
|---|---|---|
| Endurance (EF) | 122 % à 132 % | Footings, échauffements, retours au calme |
| Sortie longue (SL) | 117 % à 127 % | |
| Récupération | 145 % à 170 % | Entre les fractions (« trot ») |
| Seuil | 103 % à 106 % | |
| VMA | 90 % à 94 % | Fractionné court |
| Rapide (fartlek) | 96 % à 100 % | |
| Allure objectif | allure de course **± 3 s** | Séances spécifiques et jour J |

Intensité affichée sur les graphiques (0 à 1) : récup 0,18 · EF 0,35 · SL 0,42 · seuil 0,7 · objectif 0,8 · rapide 0,85 · VMA 1.

## 6. Séances types

Fichier : `plan.ts` (`quality`), `t` = avancement dans la phase (0 à 1)

| Séance | Contenu | Points max |
|---|---|---|
| Footing | durée calculée en EF | 60 |
| Footing + accélérations | footing + 6 × (20 s vite / 40 s trot) | 60 |
| Sortie longue | durée calculée en SL ; en phase spécifique, fin à allure objectif (10 min jusqu'au 10 km, 20 min pour le semi, 40 min pour le marathon) | 100 |
| Fartlek | échauffement 15 min, (6 + 4t) × (1 min rapide / 1 min trot), retour au calme 10 min | 100 |
| VMA | échauffement intense, puis selon la semaine : (6 + 4t) × 400 m (récup 1:15), (8 + 4t) × 1 min (récup 1 min) ou (4 + 2t) × 800 m (récup 2 min) ; retour au calme 10 min | 100 |
| Seuil | échauffement 15 min, 2 ou 3 × (8 + 4t) min (+4 min pour le marathon), récup 2 min ; retour au calme 10 min | 100 |
| Allure objectif | échauffement intense, puis 5 km : (4 + 2t) × 1 000 m · 10 km : (3 + t) × 2 000 m · semi : (3 + t) × 3 000 m · marathon : (2 + t) × 5 000 m, récup 1:30 ; une répétition de moins en affûtage | 100 |
| Jour J | la distance à allure objectif | 500 |

« Échauffement intense » = 15 min EF + 3 × (20 s d'accélération progressive / 40 s trot).

## 7. Validation des séances et RunCoins

Fichiers : `packages/core/src/scoring.ts` (validation), `packages/core/src/economy.ts` (**tout le barème et tous les plafonds**)

| Paramètre | Valeur | Rôle |
|---|---|---|
| Fenêtre de validation | de **2 jours avant à 2 jours après** la date prévue | Une activité hors fenêtre n'est pas rattachée |
| Volume « bon » | durée réalisée entre **85 % et 115 %** de la durée prévue | Score volume = 1 ; décroît jusqu'à 0 à 50 % ou 150 % |
| Tolérance d'allure par bloc | 5 % plus rapide à 8 % plus lent que la fourchette | GPS, relances, dénivelé |
| Score allures | part du temps dans la cible ÷ 0,8 (plafonné à 1) | Les récupérations ne comptent pas |
| Score final | 50 % volume + 50 % allures | |
| Statuts | ≥ 0,85 validée · ≥ 0,5 partielle · sinon non validée ; refusée si l'anti-triche rejette ; en vérification si le score de confiance est < 60 | |

**Monnaie : RunCoin (RC), 1 000 RC = 1 €** (`ECONOMY` dans `economy.ts`)

Repère marché : WeWard plafonne la marche à ~25 Wards par jour, soit environ 0,15 € par jour au maximum ; en pratique, ses utilisateurs gagnent quelques euros par mois. Foulée reste sous ce budget.

| Gain | RC | € |
|---|---|---|
| Séance validée | **100** | 0,10 |
| Séance validée en partie | **50** | 0,05 |
| Semaine complète | **150** | 0,15 |
| Challenge sponsorisé réussi | **200** | 0,20 (financé par la marque) |
| Pub vidéo regardée (30 s) | **10** | 0,01 |
| Défis entre amis, badges, plan terminé, objectif atteint | 0 RC | uniquement de l'XP |

| Plafond | Valeur |
|---|---|
| Séances payées | 1 par jour, 4 par semaine |
| Pubs | 3 par jour, 10 par semaine |
| Activité du jour (séances + pubs) | **150 RC** (0,15 €, le maximum quotidien de WeWard) |
| Challenge sponsorisé | 1 par semaine |
| Total | **750 RC/semaine**, **3 000 RC/mois** (3 €) |

Gains simulés sur 2 mois (8 semaines), vérifiés par les tests :

| Profil | RC | € |
|---|---|---|
| Occasionnel (2 séances/semaine) | 2 800 | 2,80 |
| Assidu (3 séances/semaine, quelques pubs, 1 challenge sur 2) | ~4 500 | ~4,50 |
| Au maximum (tout, tous les jours) | ≤ 6 000 | ≤ 6,00 |

Tous les plafonds sont appliqués dans l'ordre chronologique (`applyCaps`), à l'identique dans l'app et sur le serveur.

**Rentabilité de la pub** : avec un CPM de 12 €, une vue rapporte 0,012 €. Verser 10 RC (0,01 €) laisse 0,002 € de marge par vue. Ne dépasse pas 12 RC sans avoir mesuré un CPM réel plus élevé.

**Suivi de la dette** : la vue SQL `runcoin_liability` donne les RC distribués, échangés et en circulation, avec leur équivalent en euros.

## 8. Anti-triche GPS et capteurs

Fichier : `packages/core/src/antiCheat.ts` → `RUNNING_LIMITS` et `analyzeActivity`

| Contrôle | Seuil | Gravité |
|---|---|---|
| Saisie manuelle | indicateur de la plateforme ; côté app, l'absence d'information vaut « manuelle » | critique |
| Date dans le futur | plus de 5 min | critique |
| Position simulée (Android) | au moins 1 point `mocked` | critique |
| Horodatages désordonnés | plus de 1 % des points | critique |
| Téléportation | saut > **15 m/s** sur plus de 50 m : 3 ou plus = critique, sinon info | |
| Vitesse de véhicule | moyenne glissante sur 30 s > **7,5 m/s** (27 km/h) | critique |
| Accélération impossible | > **4 m/s²** sur plus de 5 % des points | alerte |
| Trace synthétique | plus de 120 points, variation de vitesse < 1,5 % **et** rythme d'enregistrement constant à 1 % près | critique |
| Cadence incohérente | foulée hors **0,4 à 2,6 m** ; critique au-delà de 3,9 m | alerte ou critique |
| Fréquence cardiaque figée | écart-type < 1 bpm (plus de 60 points) | alerte |
| Fréquence cardiaque hors limites | hors **35 à 230 bpm** sur plus de 5 % des points | alerte |
| Distance déclarée ≠ trace | écart de plus de 20 % ; critique au-delà de 50 % | alerte ou critique |
| Précision GPS faible | médiane > 50 m | info |
| Pas de trace | accepté sur tapis avec cardio ; sans cardio, alerte ; en extérieur, alerte | |
| Trace déjà envoyée | empreinte identique (positions au 1/10 000e de degré, temps relatif par pas de 10 s) | refus, tous comptes confondus |

| Score de confiance | Valeur |
|---|---|
| Départ | 100 |
| Pénalité | info 0 · alerte −20 · critique −100 |
| Verdict | une critique : refusée · score < 60 : en vérification · sinon : confiance |
| Compte | chaque refus fait baisser la confiance du compte de 25 ; **3 refus** = récompenses suspendues (`_shared/ingest.ts`) |

## 9. Dédoublonnage des sources

Fichier : `packages/core/src/dedupe.ts`

| Paramètre | Valeur |
|---|---|
| Doublon | même sport et chevauchement de plus de **80 %** de la plus courte |
| Source gardée, par ordre de priorité | Garmin > Coros, Polar, Suunto > Apple Santé > Health Connect > GPS de l'app > Strava |

## 10. Séance guidée en direct (GPS + voix)

Moteur : `packages/core/src/liveWorkout.ts` (`DEFAULTS`) · App : `apps/mobile/src/lib/useRunSession.ts` · Écran : `app/run/[id].tsx`

| Paramètre | Valeur | Rôle |
|---|---|---|
| Décompte de départ | 5-4-3-2-1-GO, 1 s par chiffre | Voix et vibrations |
| Alerte « trop rapide » | allure < bas de la fourchette − **4 %** | |
| Alerte « trop lent » | allure > haut de la fourchette + **6 %** | |
| Délai entre deux alertes | **25 s** | Évite de saturer de messages |
| Délai de mise en route | **20 s** au début de chaque bloc | Pas d'alerte pendant l'accélération |
| Alertes en récupération | aucune | |
| Décompte avant changement | 3-2-1, pour les blocs en temps d'au moins 15 s | |
| Fin de fraction | « Plus que 100 mètres », pour les blocs d'au moins 400 m | |
| Annonce kilométrique | chaque km, avec l'allure moyenne | |
| Allure du moment | lissée sur **20 s** | `PACE_WINDOW_SEC` |
| Précision GPS acceptée | ≤ **30 m** (sinon le point est gardé pour le serveur mais ignoré pour la distance) | `MAX_ACCURACY_M` |
| Saut GPS ignoré | > **12 m/s** | `MAX_SPEED_MS` |
| Fréquence GPS | 1 point par seconde, précision maximale | |
| Voix | français (`fr-FR`), vitesse 1,02 | Désactivable avant le départ |
| Écran | maintenu allumé pendant la séance | |
| Séance minimale pour valider | 60 s et 10 points GPS | |
| Fin anticipée | les blocs non courus comptent comme non faits | |
| Simulation (démo) | 5 × plus rapide ; « trop vite » = allure × 0,82, « trop lent » = × 1,2 | Désactivée avec le serveur |
| Couleurs de l'écran de course | vert = bonne allure, orange = trop vite, bleu = trop lent | Écran toujours sombre |

## 11. Nutrition et échauffement

Fichier : `packages/core/src/nutrition.ts`

| Situation | Conseil |
|---|---|
| Avant une séance intense (VMA, seuil, allure, fartlek) | 2 à 3 h avant : repas digeste riche en glucides ; 1 h avant : banane ou compote, pas à jeun |
| Avant une sortie longue | petit-déjeuner complet 2 à 3 h avant, grand verre d'eau 30 min avant |
| Avant un footing | si le dernier repas date de plus de 3 h : banane ou compote 30 à 60 min avant |
| Pendant | au-delà d'**1 h 15** : 30 à 60 g de glucides/h et 400 à 800 ml d'eau/h ; dès 50 min : un peu d'eau s'il fait chaud |
| Après une séance intense ou longue | collation glucides + protéines dans les 30 à 60 min, repas riche en protéines, ~500 ml d'eau dans l'heure |
| Après un footing | eau, repas habituel |
| Jour J | les 2 jours avant (plus de féculents si semi ou marathon), la veille, 3 h avant, 30 min avant ; pendant : rien sur 10 km, 1 à 2 gels sur semi, un gel toutes les 30 à 40 min sur marathon ; après : récupération + vrai repas |
| Prépa semi ou marathon | tester gels et boissons pendant les sorties longues et les séances à allure |

Échauffement (`warmupAdvice`) : 15 min + 3 accélérations avant la VMA et l'allure objectif ; 15 min avant le seuil et le fartlek ; départ très lent pour la sortie longue ; 10 à 15 min + accélérations avant une course.

## 12. Gamification

Fichier : `packages/core/src/gamification.ts`

| Paramètre | Valeur |
|---|---|
| XP pour atteindre le niveau n | 120 × (n − 1)^1,6 (niveau 2 : 120 XP, niveau 5 : 1 103, niveau 10 : 4 036) |
| Titres | 1 Débutant · 3 Joggeur · 5 Coureur · 8 Finisseur · 12 Machine · 16 Élite · 20 Légende |
| XP d'une séance | base × (0,5 + score), soit 75 % à 150 % ; base = points max de la séance, 400 pour le jour J |
| XP semaine complète | +150 |
| XP plan terminé | +1 000 |
| Série | séances validées d'affilée ; une séance passée non faite la casse |
| Points ≠ XP | les points se dépensent, l'XP ne baisse jamais |

Badges (13) :

| Badge | Condition | Niveau |
|---|---|---|
| Premier pas | 1 séance | bronze |
| Lancé | 10 séances | bronze |
| Infatigable | 50 séances | or |
| Sur ta lancée | série de 5 | bronze |
| En feu | série de 15 | argent |
| Semaine bouclée | 1 semaine complète | bronze |
| Métronome | 1 semaine parfaite (toutes les séances ≥ 0,95) | argent |
| Fractionneur | 10 séances de qualité | argent |
| Endurant | 5 sorties longues | argent |
| Centurion | 100 km | argent |
| Objectif atteint | jour J réussi | or |
| Jusqu'au bout | 1 plan terminé | or |
| Fair-play | 20 séances sans aucune refusée | argent |

Défis de la semaine (`weeklyQuests`) : toutes les séances de la semaine (+150 XP), footings à la bonne allure, c'est-à-dire avec un score allures ≥ 0,9 (+80 XP), séance clé réussie (+80 XP).

## 13. Hub social et défis entre joueurs

Fichiers : `packages/core/src/challenges.ts`, `supabase/functions/hub/index.ts`, `supabase/migrations/20261104000000_social_hub.sql`

| Défi | Règle | Durée | Récompense |
|---|---|---|---|
| Duel des 7 jours | le plus de km | 7 j | 200 XP (pas de RC) |
| Premier à 50 km | atteindre 50 km | 30 j | 300 XP (pas de RC) |
| 3 séances cette semaine | 3 sorties d'au moins 2 km | 7 j | 120 XP (pas de RC) |
| La sortie longue | une sortie d'au moins 15 km | 7 j | 200 XP (pas de RC) |
| 100 km en un mois | atteindre 100 km | 30 j | 400 XP (pas de RC) |
| Régularité | le plus de sorties | 14 j | 250 XP (pas de RC) |

| Paramètre | Valeur |
|---|---|
| Activités prises en compte | uniquement celles validées par l'anti-triche (« confiance »), sans doublon |
| Gagnant | « le plus » : le 1er avec plus de 0 ; « objectif » : tous ceux qui l'atteignent. Récompense en XP uniquement |
| Invités par défi | 10 max, amis uniquement |
| Statistiques visibles | km sur 7 et 30 jours, sorties sur 30 jours ; visibles par les amis seulement |
| Code ami | 6 caractères sans 0, O, 1, I, l (anti-confusion) |
| Messages | 1 000 caractères max ; **30 messages/min** max par personne ; temps réel |
| Invitation à courir | jour, heure (HH:MM), lieu (120 caractères), distance ; réponses « Je viens » / « Pas dispo » |
| Modération | retirer, bloquer (il ne peut plus t'écrire), signaler (500 caractères) |
| Pseudo | 2 à 24 caractères ; ville 40 |

## 14. Récompenses et boutique

Fichiers : `app/(tabs)/rewards.tsx` (catalogue démo), tables `partners`, `rewards` (`affiliate_url`, `kind`), `reward_codes`, fonction SQL `redeem_reward`

| Article (démo) | Coût | Équivalent |
|---|---|---|
| -10 % sur ta prochaine commande | 2 000 RC | ~1 mois de pratique régulière |
| -15 % sur un dossard | 4 000 RC | |
| Bon d'achat 5 € | 5 000 RC | ~2 mois |
| Bon d'achat 10 € | 10 000 RC | |

En production, chaque article est un **code ou un lien affilié tracké** du partenaire (commission sur l'achat). Un échange vérifie le solde et le stock, et empêche deux échanges simultanés. Le solde ne peut jamais devenir négatif.

**Pubs récompensées** (`lib/ads.native.ts`, fonction `ad-reward`) : Google AdMob avec vérification côté serveur (signature ECDSA vérifiée avec les clés publiques de Google). Les identifiants actuels sont ceux de **test** fournis par Google. Dans Expo Go et en démo, une pub de démonstration de 30 s s'affiche à la place.

**Challenge sponsorisé de la semaine** (`sponsoredChallengeOf`) : tourne entre « 20 km », « 3 sorties » et « sortie longue de 12 km » tant qu'aucun partenaire n'est enregistré dans la table `sponsored_challenges`.

## 15. Coach IA

Fichiers : `packages/core/src/prompts.ts` (consignes), `supabase/functions/coach/index.ts`

| Paramètre | Valeur |
|---|---|
| Modèle | `claude-opus-5-5` |
| Effort | conversation : `low` (réponses rapides) ; personnalisation du plan : `medium` |
| Repli de sécurité | `fallbacks: "default"` : si un filtre refuse, l'API relance sur le modèle recommandé |
| Conversation | 30 messages max envoyés, 2 000 caractères par message, réponse 4 000 jetons max |
| Contexte | entraînements en cours, **historique complet** (120 dernières séances), statistiques, niveau, série |
| Données Strava | jamais envoyées à l'IA, seulement le statut de validation (conditions d'utilisation de Strava) |
| Personnalisation | conseil ≤ 180 caractères (tronqué à 240), nutrition ≤ 140 (tronqué à 200), focus de semaine 200, résumé 500 |
| Règles du coach | ne change jamais les allures ni les volumes ; douleur ou malaise = avis médical ; pas de régime ; recentre si hors sujet |
| Mise en cache | les consignes sont mises en cache, ce qui coûte moins cher |

## 16. Intégrations

| Source | Fichier | Paramètres |
|---|---|---|
| Strava | `strava-connect`, `strava-callback`, `strava-webhook`, `_shared/strava.ts` | Autorisation `activity:read_all` ; import des **30 derniers jours** (30 activités max) ; types Run, TrailRun, VirtualRun ; cadence × 2 ; jeton rafraîchi 60 s avant expiration ; jeton de connexion valable 10 min, à usage unique |
| Garmin | `garmin-webhook`, `push-workout` | En attente de l'accès développeur Garmin ; format montre neutre dans `watchExport.ts` |
| Apple Santé | `lib/health.native.ts`, `ingest-activity` | Lecture des séances de course des **30 derniers jours** (50 max), avec trace GPS, fréquence cardiaque et indicateur « saisie manuelle » ; **pas du jour** (somme dédoublonnée par Santé, actualisée toutes les 5 min, objectif affiché 10 000) ; accès en lecture seule. Module natif : app installée uniquement |
| Nike Run Club | via Apple Santé | Nike n'a pas d'accès direct |
| Health Connect (Android) | `lib/health.native.ts` | Interface prévue, module à ajouter |
| GPS de l'app | `ingest-activity` (source `app_gps`) | Envoie la trace et le découpage en blocs |

## 17. Base de données et sécurité serveur

Fichiers : `supabase/migrations/*.sql`, `supabase/config.toml`

| Règle | Détail |
|---|---|
| Lecture | chacun ne lit que ses données ; profils et statistiques des amis via des règles dédiées |
| Écriture des points, validations et activités | **serveur uniquement** ; aucune règle ne permet au téléphone d'écrire |
| Journal de points | une clé unique par gain : un événement reçu deux fois ne paie qu'une fois |
| Jetons OAuth | chiffrés dans Supabase Vault, jamais renvoyés au téléphone |
| Session utilisateur | trousseau iOS / Keystore Android (`expo-secure-store`) |
| Connexion | anonyme au départ (`enable_anonymous_sign_ins = true`), à relier à un e-mail, Apple ou Google ensuite |
| Fonctions sans jeton utilisateur | `strava-callback`, `strava-webhook`, `garmin-webhook` (`verify_jwt = false`, sécurisées autrement) |
| Création de plan | calculée par le serveur avec le même moteur (impossible de s'inventer un plan) |
| Hébergement | région UE (RGPD : données de santé) |

## 18. Design

Fichier : `apps/mobile/src/constants/theme.ts`

| Couleur | Clair | Sombre | Usage |
|---|---|---|---|
| accent | #3A4BFF | #6C7BFF | Actions, boutons, progression |
| violet | #7B3FF2 | #A47BFF | Coach IA, dégradé énergie |
| flame | #FF6A2B | #FF8247 | Série, défis, « trop rapide » |
| gold | #FFC233 | #FFCB47 | Points, récompenses |
| xp | #16C784 | #3BE0A0 | XP, validé |
| background | #EEF1F8 | #070B16 | Fond |
| surface | #FFFFFF | #111729 | Cartes |
| bad / warn / ok | #E0452B / #C97800 / #12A06A | #FF7A61 / #F2B34A / #3BD08F | États |

| Dégradé | Couleurs | Usage |
|---|---|---|
| energy | #2B3BFF → #7B3FF2 | Niveau, coach, célébration |
| flame | #FF8A3D → #FF3D6E | Défis, piste |
| gold | #FFD65C → #FF9F1C | Trésor, barres de progression des plans |
| xp | #1ED69A → #14A3C7 | Barre d'XP |
| night | #0B1230 → #2A1252 | Carte joueur, profils |

| Mesure | Valeur |
|---|---|
| Espacements | 4, 8, 12, 16, 24, 32 |
| Arrondis | 12, 18, 26, pilule |
| Boutons | hauteur 52 (40 en petit), rebord bas de 4 px qui s'écrase à l'appui |
| Barre d'onglets | native, Liquid Glass sur iOS 26, se rétracte au défilement |
| Onglets | Accueil · Entraînements · Hub · Coach · Récompenses (Montres : icône montre de l'accueil) |

## 19. Photos

Fichier : `apps/mobile/src/lib/images.ts`

Photos Unsplash (licence gratuite) chargées en largeur 1 080 px, avec un dégradé de secours dessous :

| Clé | Utilisée pour |
|---|---|
| cityRace | objectif marathon, boutique dossard |
| marathon | objectif semi |
| trackSunset | objectif chrono 10 km, séances seuil et allure |
| road | objectif distance 10 km |
| solo | 5 km, footings |
| trackLines | VMA, fartlek |
| trail | sorties longues |
| finish | jour J |
| shoes | boutique |

Pour la production, télécharge les images retenues dans `assets/` : affichage instantané et hors ligne.

## 20. Mode démo

Activé automatiquement si `EXPO_PUBLIC_SUPABASE_URL` est vide.

| Élément | Comportement en démo |
|---|---|
| Plans | calculés sur le téléphone |
| Connexions montres | interrupteurs simulés |
| Validation | boutons de simulation (bien suivie, trop vite, écourtée, saisie manuelle, voiture, GPS falsifié) avec les vrais contrôles |
| Séance guidée | GPS réel ou simulation 5 × plus rapide |
| Hub | joueurs fictifs (Léa, Karim, Sophie, Thomas) qui répondent automatiquement en 1,8 s |
| Coach IA | désactivé (nécessite le serveur) |
| Codes de récompense | codes de démonstration `DEMO-XXXX-XXXX` |
| Stockage | sur le téléphone (`AsyncStorage`, clés `foulee/state/v2` et `foulee/social-demo/v1`) |
